/**
 * 2D PROJECTILE SIMULATOR ENGINE
 * Pure JS Implementation with Horizontal Auto-Scroll Camera
 */

class PhysicsEngine {
  constructor() {
    this.canvas = document.getElementById('simCanvas');
    this.viewport = document.getElementById('canvasViewport');
    this.ctx = this.canvas.getContext('2d');
    
    // Simulation state variables
    this.running = false;
    this.paused = false;
    this.animationFrame = null;
    
    this.t = 0;
    this.dt = 0.016; // Time step (~60 FPS)
    this.scale = 4;   // Canvas Pixels per Meter
    this.origin = { x: 50, y: 400 };

    this.position = { x: 0, y: 0 };
    this.velocity = { x: 0, y: 0 };
    this.trajectory = [];

    this.params = {};
    this.metrics = { apogee: 0, range: 0 };

    this.initEventListeners();
    this.resizeCanvas();
    this.updateScenarioConfig();
  }

  resizeCanvas() {
    this.canvas.width = this.canvas.parentElement.clientWidth;
    this.canvas.height = this.viewport.clientHeight - 20;
    this.origin.y = this.canvas.height - 60;
    this.draw();
  }

  initEventListeners() {
    window.addEventListener('resize', () => this.resizeCanvas());
    
    document.getElementById('scenarioSelect').addEventListener('change', () => this.updateScenarioConfig());
    document.getElementById('btnLaunch').addEventListener('click', () => this.start());
    document.getElementById('btnPause').addEventListener('click', () => this.togglePause());
    document.getElementById('btnReset').addEventListener('click', () => this.reset());
    document.getElementById('btnExport').addEventListener('click', () => this.exportCSV());

    // Dynamic Hover Telemetry
    this.canvas.addEventListener('mousemove', (e) => this.handleCanvasHover(e));
  }

  updateScenarioConfig() {
    const scenario = document.getElementById('scenarioSelect').value;
    const inclineLabel = document.getElementById('inclineLabel');
    const rampGroup = document.getElementById('rampLengthGroup');

    if (scenario.includes('incline')) {
      inclineLabel.parentElement.style.display = 'flex';
      rampGroup.style.display = scenario === 'incline_bounded' ? 'flex' : 'none';
    } else if (scenario === 'barrier_wall') {
      inclineLabel.parentElement.style.display = 'none';
      rampGroup.style.display = 'flex';
      document.getElementById('rampLength').previousElementSibling.innerText = 'WALL DISTANCE (m)';
    } else {
      inclineLabel.parentElement.style.display = 'none';
      rampGroup.style.display = 'none';
    }
    this.reset();
  }

  readParams() {
    const scenario = document.getElementById('scenarioSelect').value;
    const u = parseFloat(document.getElementById('velocity').value);
    const theta = parseFloat(document.getElementById('angle').value) * (Math.PI / 180);
    const alpha = parseFloat(document.getElementById('inclineAngle').value) * (Math.PI / 180);

    return {
      scenario,
      u,
      theta,
      alpha,
      x0: parseFloat(document.getElementById('launchX').value),
      y0: parseFloat(document.getElementById('launchY').value),
      g: parseFloat(document.getElementById('gravityPreset').value),
      k: parseFloat(document.getElementById('dragCoeff').value),
      rampLen: parseFloat(document.getElementById('rampLength').value),
      showVectors: document.getElementById('showVectors').checked
    };
  }

  start() {
    this.reset();
    this.params = this.readParams();
    this.position = { x: this.params.x0, y: this.params.y0 };
    this.velocity = { 
      x: this.params.u * Math.cos(this.params.theta), 
      y: this.params.u * Math.sin(this.params.theta) 
    };

    this.running = true;
    this.paused = false;
    document.getElementById('simStatus').innerText = 'RUNNING';
    document.getElementById('simStatus').style.background = '#38b000';
    document.getElementById('simStatus').style.color = '#fff';

    this.loop();
  }

  togglePause() {
    if (!this.running) return;
    this.paused = !this.paused;
    document.getElementById('btnPause').innerText = this.paused ? 'RESUME' : 'PAUSE';
    document.getElementById('simStatus').innerText = this.paused ? 'PAUSED' : 'RUNNING';
    if (!this.paused) this.loop();
  }

  reset() {
    this.running = false;
    this.paused = false;
    cancelAnimationFrame(this.animationFrame);
    this.t = 0;
    this.position = { x: 0, y: 0 };
    this.velocity = { x: 0, y: 0 };
    this.trajectory = [];
    this.metrics = { apogee: 0, range: 0 };
    
    document.getElementById('simStatus').innerText = 'READY';
    document.getElementById('simStatus').style.background = '#fff';
    document.getElementById('simStatus').style.color = '#000';
    document.getElementById('btnPause').innerText = 'PAUSE';

    this.viewport.scrollLeft = 0;
    this.updateUI(0, 0, 0, 0, 0, 0);
    this.draw();
  }

  loop() {
    if (!this.running || this.paused) return;

    for (let i = 0; i < 2; i++) { // Sub-stepping for precision
      this.stepPhysics();
    }

    this.draw();
    this.autoScrollCamera();
    this.updateUI(
      this.t, 
      this.position.x, 
      this.position.y, 
      Math.hypot(this.velocity.x, this.velocity.y),
      this.metrics.apogee,
      this.metrics.range
    );

    if (this.checkCollisions()) {
      this.running = false;
      document.getElementById('simStatus').innerText = 'FINISHED';
      document.getElementById('simStatus').style.background = '#35a7ff';
      return;
    }

    this.animationFrame = requestAnimationFrame(() => this.loop());
  }

  autoScrollCamera() {
    const projPixelX = this.origin.x + (this.position.x * this.scale);
    const viewportRight = this.viewport.scrollLeft + this.viewport.clientWidth - 150;
    
    if (projPixelX > viewportRight) {
      this.viewport.scrollLeft = projPixelX - (this.viewport.clientWidth / 2);
    }
  }

  stepPhysics() {
    const { g, k } = this.params;
    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    
    // Drag forces: F_d = k * v^2
    const ax = -k * speed * this.velocity.x;
    const ay = -g - (k * speed * this.velocity.y);

    // Euler Integration
    this.velocity.x += ax * this.dt;
    this.velocity.y += ay * this.dt;

    this.position.x += this.velocity.x * this.dt;
    this.position.y += this.velocity.y * this.dt;

    this.t += this.dt;

    // Track metrics
    if (this.position.y > this.metrics.apogee) this.metrics.apogee = this.position.y;
    this.metrics.range = this.position.x;

    this.trajectory.push({ 
      t: this.t, 
      x: this.position.x, 
      y: this.position.y,
      vx: this.velocity.x,
      vy: this.velocity.y 
    });
  }

  checkCollisions() {
    const { scenario, alpha, rampLen } = this.params;
    const { x, y } = this.position;

    // Standard Flat Ground
    if (scenario === 'flat' && y <= 0 && this.t > 0.05) {
      this.position.y = 0;
      return true;
    }

    // Unlimited Incline Planes
    if (scenario === 'incline_up' && y <= x * Math.tan(alpha) && this.t > 0.05) {
      return true;
    }
    if (scenario === 'incline_down' && y <= x * Math.tan(-alpha) && this.t > 0.05) {
      return true;
    }

    // Bounded Ramp Target
    if (scenario === 'incline_bounded') {
      const rampMaxX = rampLen * Math.cos(alpha);
      const rampY = x * Math.tan(alpha);
      
      if (x <= rampMaxX && y <= rampY && this.t > 0.05) return true; // Landed on slope
      if (x > rampMaxX && y <= 0) return true; // Overshot slope to flat ground
    }

    // Vertical Barrier Elastic Wall Collision
    if (scenario === 'barrier_wall') {
      if (x >= rampLen && this.velocity.x > 0) {
        this.velocity.x = -this.velocity.x * 0.8; // Restitution factor 0.8
        this.position.x = rampLen;
      }
      if (y <= 0 && this.t > 0.05) return true;
    }

    return false;
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawGrid();
    this.drawEnvironment();
    this.drawTrajectory();

    if (this.running || this.trajectory.length > 0) {
      this.drawProjectile();
    }
  }

  drawGrid() {
    const ctx = this.ctx;
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 1;

    const gridSize = 50; // pixels
    for (let x = 0; x < this.canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < this.canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.canvas.width, y);
      ctx.stroke();
    }
  }

  drawEnvironment() {
    const ctx = this.ctx;
    const { scenario, alpha, rampLen } = this.params;
    const ox = this.origin.x;
    const oy = this.origin.y;

    // Ground Line
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, oy);
    ctx.lineTo(this.canvas.width, oy);
    ctx.stroke();

    // Draw Inclines / Obstacles
    if (scenario && scenario.includes('incline')) {
      ctx.fillStyle = 'rgba(255, 230, 0, 0.3)';
      ctx.beginPath();
      ctx.moveTo(ox, oy);

      const length = scenario === 'incline_bounded' ? rampLen * this.scale : 2000;
      const angle = scenario === 'incline_down' ? -alpha : alpha;
      
      const endX = ox + length * Math.cos(angle);
      const endY = oy - length * Math.sin(angle);

      ctx.lineTo(endX, endY);
      ctx.lineTo(endX, oy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    if (scenario === 'barrier_wall') {
      const wallX = ox + rampLen * this.scale;
      ctx.fillStyle = '#ff5964';
      ctx.fillRect(wallX, oy - 300, 12, 300);
      ctx.strokeRect(wallX, oy - 300, 12, 300);
    }
  }

  drawTrajectory() {
    if (this.trajectory.length < 2) return;

    const ctx = this.ctx;
    ctx.beginPath();
    ctx.strokeStyle = '#ff5964';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 6]);

    this.trajectory.forEach((pt, idx) => {
      const cx = this.origin.x + pt.x * this.scale;
      const cy = this.origin.y - pt.y * this.scale;
      if (idx === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });

    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawProjectile() {
    const ctx = this.ctx;
    const cx = this.origin.x + this.position.x * this.scale;
    const cy = this.origin.y - this.position.y * this.scale;

    // Draw Projectile Ball
    ctx.fillStyle = '#35a7ff';
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#000';
    ctx.stroke();

    // Draw Velocity & Force Vector Overlay Arrows
    if (this.params.showVectors && this.running) {
      // Velocity Vector (Blue Arrow)
      this.drawArrow(cx, cy, cx + this.velocity.x * 1.5, cy - this.velocity.y * 1.5, '#35a7ff');
      // Gravity Vector (Red Arrow Down)
      this.drawArrow(cx, cy, cx, cy + this.params.g * 3, '#ff5964');
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
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  handleCanvasHover(e) {
    if (this.trajectory.length === 0) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const overlay = document.getElementById('canvasOverlay');

    const hoveredPt = this.trajectory.find(pt => {
      const cx = this.origin.x + pt.x * this.scale;
      const cy = this.origin.y - pt.y * this.scale;
      return Math.hypot(mx - cx, my - cy) < 10;
    });

    if (hoveredPt) {
      overlay.innerText = `t: ${hoveredPt.t.toFixed(2)}s | x: ${hoveredPt.x.toFixed(1)}m | y: ${hoveredPt.y.toFixed(1)}m | v: ${Math.hypot(hoveredPt.vx, hoveredPt.vy).toFixed(1)}m/s`;
    }
  }

  updateUI(t, x, y, v, apogee, range) {
    document.getElementById('valTime').innerText = `${t.toFixed(2)} s`;
    document.getElementById('valX').innerText = `${x.toFixed(2)} m`;
    document.getElementById('valY').innerText = `${y.toFixed(2)} m`;
    document.getElementById('valVel').innerText = `${v.toFixed(2)} m/s`;
    document.getElementById('valApogee').innerText = `${apogee.toFixed(2)} m`;
    document.getElementById('valRange').innerText = `${range.toFixed(2)} m`;
  }

  exportCSV() {
    if (this.trajectory.length === 0) return alert('No simulation data available to export.');

    let csv = 'Time(s),Position_X(m),Position_Y(m),Velocity_X(m/s),Velocity_Y(m/s)\n';
    this.trajectory.forEach(pt => {
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

// Instantiate Engine on DOM Load
document.addEventListener('DOMContentLoaded', () => {
  window.simEngine = new PhysicsEngine();
});