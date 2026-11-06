/**
 * 2D PROJECTILE SIMULATOR ENGINE
 * Pure JS — World-space camera with full 2D pan/zoom.
 *
 * Coordinate model:
 *   - World coords: meters, origin (0,0) at ground level.
 *   - Screen coords: canvas pixels (CSS pixels; DPR handled separately).
 *   - Camera: { x, y (world center), scale (px per meter) }.
 */

class PhysicsEngine {
  constructor() {
    this.canvas = document.getElementById('simCanvas');
    this.viewport = document.getElementById('canvasViewport');
    this.ctx = this.canvas.getContext('2d');

    // Simulation state
    this.running = false;
    this.paused = false;
    this.animationFrame = null;

    this.t = 0;
    this.dt = 0.008;              // base step; sub-stepped in loop
    this.baseScale = 4;           // px per meter
    this.scale = this.baseScale;

    // Camera in world coords (center of view)
    this.camera = { x: 40, y: 40, scale: this.baseScale };

    // Projectile world state
    this.position = { x: 0, y: 0 };
    this.velocity = { x: 0, y: 0 };
    this.trajectory = [];

    this.params = {};
    this.metrics = { apogee: 0, range: 0 };

    this.dragging = false;
    this.dragStart = null;
    this.cameraStart = null;

    this.cssWidth = 1;
    this.cssHeight = 1;
    this._camInitialized = false;

    this.initEventListeners();
    this.resizeCanvas();
    this.updateScenarioConfig();
    this.updateZoomReadout();
  }

  /* ============================================================
   * CANVAS + CAMERA MANAGEMENT
   * ============================================================ */

  resizeCanvas() {
    const rect = this.viewport.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.cssWidth = Math.max(1, rect.width);
    this.cssHeight = Math.max(1, rect.height);

    this.canvas.width = Math.floor(this.cssWidth * dpr);
    this.canvas.height = Math.floor(this.cssHeight * dpr);
    this.canvas.style.width = this.cssWidth + 'px';
    this.canvas.style.height = this.cssHeight + 'px';

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!this._camInitialized) {
      this.centerCameraOnOrigin();
      this._camInitialized = true;
    }
    this.draw();
  }

  centerCameraOnOrigin() {
    const pxWidth = this.cssWidth;
    const pxHeight = this.cssHeight;
    this.camera.scale = this.baseScale;

    // world x=0 at ~15% of view width
    this.camera.x = (0.35 * pxWidth) / this.camera.scale;
    // ground y=0 at ~75% down
    this.camera.y = (0.25 * pxHeight) / this.camera.scale;
  }

  worldToScreen(wx, wy) {
    const s = this.camera.scale;
    const cx = this.cssWidth / 2;
    const cy = this.cssHeight / 2;
    return {
      x: (wx - this.camera.x) * s + cx,
      y: (this.camera.y - wy) * s + cy,
    };
  }

  screenToWorld(sx, sy) {
    const s = this.camera.scale;
    const cx = this.cssWidth / 2;
    const cy = this.cssHeight / 2;
    return {
      x: (sx - cx) / s + this.camera.x,
      y: this.camera.y - (sy - cy) / s,
    };
  }

  zoomAt(screenX, screenY, factor) {
    const worldBefore = this.screenToWorld(screenX, screenY);
    const newScale = Math.min(40, Math.max(0.5, this.camera.scale * factor));
    this.camera.scale = newScale;
    const worldAfter = this.screenToWorld(screenX, screenY);
    this.camera.x += worldBefore.x - worldAfter.x;
    this.camera.y += worldBefore.y - worldAfter.y;
    this.updateZoomReadout();
    this.draw();
  }

  updateZoomReadout() {
    const el = document.getElementById('zoomLevel');
    if (el) el.innerText = this.camera.scale.toFixed(1) + 'x';
  }

  /* ============================================================
   * EVENT LISTENERS
   * ============================================================ */

  initEventListeners() {
    window.addEventListener('resize', () => this.resizeCanvas());

    document.getElementById('scenarioSelect')
      .addEventListener('change', () => this.updateScenarioConfig());
    document.getElementById('btnLaunch').addEventListener('click', () => this.start());
    document.getElementById('btnPause').addEventListener('click', () => this.togglePause());
    document.getElementById('btnReset').addEventListener('click', () => this.reset());
    document.getElementById('btnExport').addEventListener('click', () => this.exportCSV());

    // Camera pan (drag)
    this.viewport.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.viewport.classList.add('dragging');
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.cameraStart = { x: this.camera.x, y: this.camera.y };
    });
    window.addEventListener('mousemove', (e) => {
      if (this.dragging) {
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        this.camera.x = this.cameraStart.x - dx / this.camera.scale;
        this.camera.y = this.cameraStart.y + dy / this.camera.scale;
        this.draw();
      }
    });
    window.addEventListener('mouseup', () => {
      if (this.dragging) {
        this.dragging = false;
        this.viewport.classList.remove('dragging');
      }
    });

    // Wheel zoom (cursor-anchored)
    this.viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      this.zoomAt(mx, my, factor);
    }, { passive: false });

    // Hover telemetry
    this.canvas.addEventListener('mousemove', (e) => this.handleCanvasHover(e));

    // Zoom buttons
    document.getElementById('btnZoomIn').addEventListener('click', () => {
      this.zoomAt(this.cssWidth / 2, this.cssHeight / 2, 1.2);
    });
    document.getElementById('btnZoomOut').addEventListener('click', () => {
      this.zoomAt(this.cssWidth / 2, this.cssHeight / 2, 1 / 1.2);
    });
    document.getElementById('btnCenter').addEventListener('click', () => {
      this.centerCameraOnOrigin();
      this.draw();
    });
  }

  /* ============================================================
   * SCENARIO CONFIG (UI)
   * ============================================================ */

  updateScenarioConfig() {
    const scenario = document.getElementById('scenarioSelect').value;

    const inclineGroup = document.getElementById('inclineAngleGroup');
    const rampLenGroup = document.getElementById('rampLengthGroup');
    const rampSideRow = document.getElementById('rampSideRow');
    const rampLenLabel = document.getElementById('rampLengthLabel');

    inclineGroup.style.display = 'flex';
    rampLenGroup.style.display = 'flex';
    rampSideRow.style.display = 'none';
    rampLenLabel.innerText = 'RAMP LENGTH (m)';

    if (scenario === 'flat') {
      inclineGroup.style.display = 'none';
      rampLenGroup.style.display = 'none';
    } else if (scenario === 'barrier_wall') {
      inclineGroup.style.display = 'none';
      rampLenGroup.style.display = 'flex';
      rampLenLabel.innerText = 'WALL DISTANCE (m)';
    } else if (scenario === 'incline_bounded' ||
               scenario === 'incline_up' ||
               scenario === 'incline_down') {
      rampSideRow.style.display = 'flex';
    }

    this.reset();
  }

  readParams() {
    const scenario = document.getElementById('scenarioSelect').value;
    const u = parseFloat(document.getElementById('velocity').value) || 0;
    const theta = (parseFloat(document.getElementById('angle').value) || 0) * Math.PI / 180;
    const alpha = (parseFloat(document.getElementById('inclineAngle').value) || 0) * Math.PI / 180;

    return {
      scenario,
      u,
      theta,
      alpha,
      x0: parseFloat(document.getElementById('launchX').value) || 0,
      y0: parseFloat(document.getElementById('launchY').value) || 0,
      g: parseFloat(document.getElementById('gravityPreset').value) || 9.81,
      k: parseFloat(document.getElementById('dragCoeff').value) || 0,
      rampLen: parseFloat(document.getElementById('rampLength').value) || 120,
      rampSide: document.getElementById('rampSide').value,
      showVectors: document.getElementById('showVectors').checked,
      autoFollow: document.getElementById('autoFollow').checked,
    };
  }

  /* ============================================================
   * RAMP GEOMETRY
   * ============================================================ */

  getRampSegment() {
    const { scenario, alpha, rampLen } = this.params;
    if (!scenario || !scenario.includes('incline')) return null;

    const a = alpha;

    if (scenario === 'incline_up') {
      const x2 = rampLen * Math.cos(a);
      const y2 = rampLen * Math.sin(a);
      return { x1: 0, y1: 0, x2, y2, angle: a, length: rampLen };
    }
    if (scenario === 'incline_down') {
      // Descending ramp: top-left high, bottom-right at ground.
      const topY = rampLen * Math.sin(a);
      const bottomX = rampLen * Math.cos(a);
      return {
        x1: 0, y1: topY,
        x2: bottomX, y2: 0,
        angle: -a,
        length: rampLen,
        descending: true,
      };
    }
    if (scenario === 'incline_bounded') {
      const x2 = rampLen * Math.cos(a);
      const y2 = rampLen * Math.sin(a);
      return { x1: 0, y1: 0, x2, y2, angle: a, length: rampLen, bounded: true };
    }
    return null;
  }

  /* ============================================================
   * SIMULATION CONTROL
   * ============================================================ */

  start() {
    this.reset();
    this.params = this.readParams();

    let launchX = this.params.x0;
    let launchY = this.params.y0;

    const ramp = this.getRampSegment();
    if (ramp) {
      if (this.params.rampSide === 'top') {
        if (this.params.scenario === 'incline_down') {
          launchX = ramp.x1;
          launchY = ramp.y1;
        } else {
          launchX = ramp.x2;
          launchY = ramp.y2;
        }
      } else {
        if (this.params.scenario === 'incline_down') {
          launchX = ramp.x2;
          launchY = ramp.y2;
        } else {
          launchX = ramp.x1;
          launchY = ramp.y1;
        }
      }
    }

    this.params.effLaunchX = launchX;
    this.params.effLaunchY = launchY;

    this.position = { x: launchX, y: launchY };
    this.velocity = {
      x: this.params.u * Math.cos(this.params.theta),
      y: this.params.u * Math.sin(this.params.theta),
    };

    // Prefill trajectory so hover works from t=0
    this.trajectory.push({
      t: 0, x: launchX, y: launchY,
      vx: this.velocity.x, vy: this.velocity.y,
    });

    this.running = true;
    this.paused = false;
    this.setStatus('RUNNING', '#38b000', '#fff');

    this.loop();
  }

  togglePause() {
    if (!this.running) return;
    this.paused = !this.paused;
    document.getElementById('btnPause').innerText = this.paused ? 'RESUME' : 'PAUSE';
    this.setStatus(
      this.paused ? 'PAUSED' : 'RUNNING',
      this.paused ? '#ffe600' : '#38b000',
      this.paused ? '#000' : '#fff'
    );
    if (!this.paused) this.loop();
  }

  reset() {
    this.running = false;
    this.paused = false;
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    this.t = 0;
    this.position = { x: 0, y: 0 };
    this.velocity = { x: 0, y: 0 };
    this.trajectory = [];
    this.metrics = { apogee: 0, range: 0 };

    this.setStatus('READY', '#fff', '#000');
    document.getElementById('btnPause').innerText = 'PAUSE';

    this.updateUI(0, 0, 0, 0, 0, 0);
    document.getElementById('canvasOverlay').innerText =
      'Drag to pan • Scroll to move • Hover trajectory for telemetry';
    this.draw();
  }

  setStatus(text, bg, color) {
    const el = document.getElementById('simStatus');
    el.innerText = text;
    el.style.background = bg;
    el.style.color = color;
  }

  loop() {
    if (!this.running || this.paused) return;

    // Sub-step for accuracy
    const subSteps = 2;
    for (let i = 0; i < subSteps; i++) {
      this.stepPhysics();
      if (this.checkCollisions()) break;
    }

    if (this.params.autoFollow) this.followProjectile();
    this.draw();

    this.updateUI(
      this.t,
      this.position.x,
      this.position.y,
      Math.hypot(this.velocity.x, this.velocity.y),
      this.metrics.apogee,
      this.metrics.range
    );

    if (!this.running) {
      this.setStatus('FINISHED', '#35a7ff', '#fff');
      return;
    }

    this.animationFrame = requestAnimationFrame(() => this.loop());
  }

  followProjectile() {
    const s = this.camera.scale;
    const margin = 120; // px from edge

    const scr = this.worldToScreen(this.position.x, this.position.y);

    let moved = false;
    if (scr.x > this.cssWidth - margin) {
      this.camera.x += (scr.x - (this.cssWidth - margin)) / s;
      moved = true;
    } else if (scr.x < margin) {
      this.camera.x -= (margin - scr.x) / s;
      moved = true;
    }
    if (scr.y > this.cssHeight - margin) {
      this.camera.y -= (scr.y - (this.cssHeight - margin)) / s;
      moved = true;
    } else if (scr.y < margin) {
      this.camera.y += (margin - scr.y) / s;
      moved = true;
    }
    if (moved) this.draw();
  }

  stepPhysics() {
    const { g, k } = this.params;
    const speed = Math.hypot(this.velocity.x, this.velocity.y);

    const ax = -k * speed * this.velocity.x;
    const ay = -g - (k * speed * this.velocity.y);

    this.velocity.x += ax * this.dt;
    this.velocity.y += ay * this.dt;

    this.position.x += this.velocity.x * this.dt;
    this.position.y += this.velocity.y * this.dt;

    this.t += this.dt;

    if (this.position.y > this.metrics.apogee) this.metrics.apogee = this.position.y;
    this.metrics.range = this.position.x;

    this.trajectory.push({
      t: this.t,
      x: this.position.x,
      y: this.position.y,
      vx: this.velocity.x,
      vy: this.velocity.y,
    });
  }

  /* ============================================================
   * COLLISION
   * ============================================================ */

  checkCollisions() {
    if (this.t < 0.05) return false;
    const { scenario, alpha, rampLen } = this.params;
    const { x, y } = this.position;

    // Flat ground
    if (scenario === 'flat') {
      if (y <= 0) {
        this.position.y = 0;
        return this.finish();
      }
      return false;
    }

    // Unlimited incline up
    if (scenario === 'incline_up') {
      // Ramp line: y = x * tan(alpha) for x >= 0, else ground y=0
      if (x >= 0) {
        const rampY = x * Math.tan(alpha);
        if (y <= rampY) {
          this.position.y = rampY;
          return this.finish();
        }
      } else {
        if (y <= 0) {
          this.position.y = 0;
          return this.finish();
        }
      }
      return false;
    }

    // Unlimited incline down — ramp line descends from (0, top) to ground on the right
    if (scenario === 'incline_down') {
      const ramp = this.getRampSegment();
      if (!ramp) return false;
      // If we're under the descending line and above ground, land on it
      const slope = (ramp.y2 - ramp.y1) / (ramp.x2 - ramp.x1); // negative
      const rampYAtX = ramp.y1 + slope * x;
      if (x >= ramp.x1 && x <= ramp.x2) {
        if (y <= rampYAtX) {
          this.position.y = rampYAtX;
          return this.finish();
        }
      } else if (x > ramp.x2) {
        if (y <= 0) {
          this.position.y = 0;
          return this.finish();
        }
      } else {
        // left of ramp top — hit ground at y=0? Only if goes below 0
        if (y <= 0) {
          this.position.y = 0;
          return this.finish();
        }
      }
      return false;
    }

    // Bounded ramp target
    if (scenario === 'incline_bounded') {
      const rampMaxX = rampLen * Math.cos(alpha);
      const rampYAtX = x * Math.tan(alpha);
      if (x >= 0 && x <= rampMaxX && y <= rampYAtX) {
        this.position.y = rampYAtX;
        return this.finish();
      }
      if (y <= 0) {
        this.position.y = 0;
        return this.finish();
      }
      return false;
    }

    // Vertical barrier wall
    if (scenario === 'barrier_wall') {
      if (x >= rampLen && this.velocity.x > 0) {
        this.velocity.x = -this.velocity.x * 0.8;
        this.position.x = rampLen;
      }
      if (y <= 0) {
        this.position.y = 0;
        return this.finish();
      }
      return false;
    }

    return false;
  }

  finish() {
    this.running = false;
    return true;
  }

  /* ============================================================
   * RENDERING
   * ============================================================ */

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    this.drawGrid();
    this.drawEnvironment();
    this.drawTrajectory();
    this.drawProjectile();
    this.drawAxes();
  }

  drawGrid() {
    const ctx = this.ctx;
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 1;

    // Grid spacing in world meters that maps to ~50px on screen
    let worldStep = 50 / this.camera.scale;
    // Round to nice number
    const niceSteps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    let chosen = niceSteps[0];
    for (const s of niceSteps) {
      if (s >= worldStep) { chosen = s; break; }
      chosen = s;
    }
    const stepPx = chosen * this.camera.scale;

    // world range visible
    const topLeft = this.screenToWorld(0, 0);
    const bottomRight = this.screenToWorld(this.cssWidth, this.cssHeight);

    const startX = Math.floor(topLeft.x / chosen) * chosen;
    const endX = bottomRight.x;
    for (let wx = startX; wx <= endX; wx += chosen) {
      const p = this.worldToScreen(wx, 0);
      ctx.beginPath();
      ctx.moveTo(p.x, 0);
      ctx.lineTo(p.x, this.cssHeight);
      ctx.stroke();
    }

    const startY = Math.floor(bottomRight.y / chosen) * chosen;
    const endY = topLeft.y;
    for (let wy = startY; wy <= endY; wy += chosen) {
      const p = this.worldToScreen(0, wy);
      ctx.beginPath();
      ctx.moveTo(0, p.y);
      ctx.lineTo(this.cssWidth, p.y);
      ctx.stroke();
    }
  }

  drawAxes() {
    const ctx = this.ctx;
    // Ground line y=0
    const groundPx = this.worldToScreen(0, 0);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, groundPx.y);
    ctx.lineTo(this.cssWidth, groundPx.y);
    ctx.stroke();

    // Y-axis at x=0
    const yAxis = this.worldToScreen(0, 0);
    ctx.beginPath();
    ctx.moveTo(yAxis.x, 0);
    ctx.lineTo(yAxis.x, this.cssHeight);
    ctx.stroke();
  }

  drawEnvironment() {
    const ctx = this.ctx;
    const { scenario, alpha, rampLen } = this.params;
    if (!scenario) return;

    if (scenario.includes('incline')) {
      const ramp = this.getRampSegment();
      if (ramp) {
        const p1 = this.worldToScreen(ramp.x1, ramp.y1);
        const p2 = this.worldToScreen(ramp.x2, ramp.y2);
        const groundL = this.worldToScreen(ramp.x1, 0);
        const groundR = this.worldToScreen(ramp.x2, 0);

        ctx.fillStyle = 'rgba(255, 230, 0, 0.35)';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(groundR.x, groundR.y);
        ctx.lineTo(groundL.x, groundL.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Hatch slope line
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }

    if (scenario === 'barrier_wall') {
      const wallBottom = this.worldToScreen(rampLen, 0);
      const wallTop = this.worldToScreen(rampLen, 60);
      const wallW = 12;

      ctx.fillStyle = '#ff5964';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;

      ctx.beginPath();
      ctx.rect(wallBottom.x, wallTop.y, wallW, wallBottom.y - wallTop.y);
      ctx.fill();
      ctx.stroke();
    }
  }

  drawTrajectory() {
    if (this.trajectory.length < 2) return;
    const ctx = this.ctx;

    ctx.beginPath();
    ctx.strokeStyle = '#ff5964';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 6]);

    this.trajectory.forEach((pt, idx) => {
      const p = this.worldToScreen(pt.x, pt.y);
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });

    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawProjectile() {
    if (this.trajectory.length === 0 && !this.running) return;

    const ctx = this.ctx;
    const p = this.worldToScreen(this.position.x, this.position.y);

    ctx.fillStyle = '#35a7ff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#000';
    ctx.stroke();

    if (this.params.showVectors && this.running) {
      const scaleV = 1.5;
      this.drawArrow(
        p.x, p.y,
        p.x + this.velocity.x * scaleV,
        p.y - this.velocity.y * scaleV,
        '#35a7ff'
      );
      this.drawArrow(
        p.x, p.y,
        p.x, p.y + this.params.g * 3,
        '#ff5964'
      );
    }
  }

  drawArrow(fromX, fromY, toX, toY, color) {
    const ctx = this.ctx;
    const headlen = 8;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - headlen * Math.cos(angle - Math.PI / 6),
      toY - headlen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      toX - headlen * Math.cos(angle + Math.PI / 6),
      toY - headlen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  }

  /* ============================================================
   * HOVER TELEMETRY
   * ============================================================ */

  handleCanvasHover(e) {
    if (this.trajectory.length === 0) return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const overlay = document.getElementById('canvasOverlay');

    let closest = null;
    let bestDist = 12;
    for (const pt of this.trajectory) {
      const sp = this.worldToScreen(pt.x, pt.y);
      const d = Math.hypot(mx - sp.x, my - sp.y);
      if (d < bestDist) {
        bestDist = d;
        closest = pt;
      }
    }

    if (closest) {
      overlay.innerText =
        `t: ${closest.t.toFixed(2)}s | x: ${closest.x.toFixed(1)}m | y: ${closest.y.toFixed(1)}m | v: ${Math.hypot(closest.vx, closest.vy).toFixed(1)}m/s`;
    } else {
      overlay.innerText =
        'Drag to pan • Scroll to move • Hover trajectory for telemetry';
    }
  }

  /* ============================================================
   * UI UPDATES
   * ============================================================ */

  updateUI(t, x, y, v, apogee, range) {
    document.getElementById('valTime').innerText = `${t.toFixed(2)} s`;
    document.getElementById('valX').innerText = `${x.toFixed(2)} m`;
    document.getElementById('valY').innerText = `${y.toFixed(2)} m`;
    document.getElementById('valVel').innerText = `${v.toFixed(2)} m/s`;
    document.getElementById('valApogee').innerText = `${apogee.toFixed(2)} m`;
    document.getElementById('valRange').innerText = `${range.toFixed(2)} m`;
  }

  /* ============================================================
   * CSV EXPORT
   * ============================================================ */

  exportCSV() {
    if (this.trajectory.length === 0) {
      alert('No simulation data available to export.');
      return;
    }

    let csv = 'Time(s),Position_X(m),Position_Y(m),Velocity_X(m/s),Velocity_Y(m/s)\n';
    this.trajectory.forEach((pt) => {
      csv += `${pt.t.toFixed(3)},${pt.x.toFixed(3)},${pt.y.toFixed(3)},${pt.vx.toFixed(3)},${pt.vy.toFixed(3)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `projectile_telemetry_${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }
}

/* Instantiate on DOM load */
document.addEventListener('DOMContentLoaded', () => {
  window.simEngine = new PhysicsEngine();
});