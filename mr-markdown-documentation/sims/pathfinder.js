// ============================================================
//  Interactive A* Maze Solver
//  Drag start/end nodes, generate mazes, real-time solving
// ============================================================

let mazeDensity = 25;
let diagonal = false;

if (window.__simProps) {
  if (window.__simProps.mazeDensity !== undefined) mazeDensity = window.__simProps.mazeDensity;
  if (window.__simProps.diagonal !== undefined) diagonal = window.__simProps.diagonal;
}

window.addEventListener("bk:props", (e) => {
  const p = e.detail;
  let needMazeRegen = false;
  let needSolve = false;
  
  if (p.mazeDensity !== undefined && p.mazeDensity !== mazeDensity) {
    mazeDensity = p.mazeDensity;
    needMazeRegen = true;
  }
  if (p.diagonal !== undefined && p.diagonal !== diagonal) {
    diagonal = p.diagonal;
    needSolve = true;
  }
  
  if (needMazeRegen) {
    generateMaze();
    solveAlgorithm();
  } else if (needSolve) {
    solveAlgorithm();
  }
});

const COLS = 40;
const ROWS = 26;
let grid = [];
let startNode;
let endNode;

let openSet = [];
let closedSet = [];
let path = [];
let algorithmDone = false;
let noSolution = false;

// Dragging state
let draggingNode = null; // 'start', 'end', 'wall', 'empty', or null
let hoverC = -1;
let hoverR = -1;

function Heuristic(a, b) {
  const d1 = Math.abs(b.c - a.c);
  const d2 = Math.abs(b.r - a.r);
  return diagonal ? Math.max(d1, d2) : d1 + d2;
}

class Node {
  constructor(c, r) {
    this.c = c;
    this.r = r;
    this.wall = false;
    this.f = 0;
    this.g = 0;
    this.h = 0;
    this.neighbors = [];
    this.previous = null;
    this.visitedPulse = 0;
  }

  addNeighbors(grid) {
    this.neighbors = [];
    const c = this.c;
    const r = this.r;

    if (r > 0) this.neighbors.push(grid[c][r - 1]);
    if (c < COLS - 1) this.neighbors.push(grid[c + 1][r]);
    if (r < ROWS - 1) this.neighbors.push(grid[c][r + 1]);
    if (c > 0) this.neighbors.push(grid[c - 1][r]);

    if (diagonal) {
      if (c > 0 && r > 0) this.neighbors.push(grid[c - 1][r - 1]);
      if (c < COLS - 1 && r > 0) this.neighbors.push(grid[c + 1][r - 1]);
      if (c > 0 && r < ROWS - 1) this.neighbors.push(grid[c - 1][r + 1]);
      if (c < COLS - 1 && r < ROWS - 1) this.neighbors.push(grid[c + 1][r + 1]);
    }
  }
}

function initGrid() {
  grid = new Array(COLS);
  for (let c = 0; c < COLS; c++) {
    grid[c] = new Array(ROWS);
    for (let r = 0; r < ROWS; r++) {
      grid[c][r] = new Node(c, r);
    }
  }
  startNode = grid[4][Math.floor(ROWS/2)];
  endNode = grid[COLS - 5][Math.floor(ROWS/2)];
}

function generateMaze() {
  const chance = mazeDensity / 100;
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      let node = grid[c][r];
      if (node !== startNode && node !== endNode) {
        node.wall = Math.random() < chance;
      }
    }
  }
}

function solveAlgorithm() {
  // Reset nodes
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      grid[c][r].addNeighbors(grid);
      grid[c][r].previous = null;
      grid[c][r].g = 0;
      grid[c][r].f = 0;
      grid[c][r].h = 0;
      grid[c][r].visitedPulse = 0;
    }
  }
  
  openSet = [startNode];
  closedSet = [];
  path = [];
  algorithmDone = false;
  noSolution = false;
  
  // Instantly solve for real-time dragging
  while (openSet.length > 0) {
    let winner = 0;
    for (let i = 0; i < openSet.length; i++) {
      if (openSet[i].f < openSet[winner].f) winner = i;
    }
    let current = openSet[winner];

    if (current === endNode) {
      algorithmDone = true;
      let temp = current;
      path.push(temp);
      while (temp.previous) {
        path.push(temp.previous);
        temp = temp.previous;
      }
      return;
    }

    openSet.splice(winner, 1);
    closedSet.push(current);

    for (let i = 0; i < current.neighbors.length; i++) {
      let neighbor = current.neighbors[i];
      if (!closedSet.includes(neighbor) && !neighbor.wall) {
        let tempG = current.g + (diagonal && (neighbor.c !== current.c && neighbor.r !== current.r) ? Math.SQRT2 : 1);
        let newPath = false;
        
        if (openSet.includes(neighbor)) {
          if (tempG < neighbor.g) {
            neighbor.g = tempG;
            newPath = true;
          }
        } else {
          neighbor.g = tempG;
          newPath = true;
          openSet.push(neighbor);
        }

        if (newPath) {
          neighbor.h = Heuristic(neighbor, endNode);
          neighbor.f = neighbor.g + neighbor.h;
          neighbor.previous = current;
        }
      }
    }
  }
  noSolution = true;
}

let initialized = false;
let cellW = 0;
let cellH = 0;
let time = 0;

function draw(ctx, logicalW, logicalH) {
  if (!initialized) {
    const canvas = ctx.canvas;
    canvas.style.touchAction = "none";
    
    cellW = logicalW / COLS;
    cellH = logicalH / ROWS;

    function getCell(e) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = logicalW / rect.width;
      const scaleY = logicalH / rect.height;
      const lx = (e.clientX - rect.left) * scaleX;
      const ly = (e.clientY - rect.top) * scaleY;
      const c = Math.floor(lx / cellW);
      const r = Math.floor(ly / cellH);
      return {c, r};
    }

    canvas.addEventListener("pointerdown", (e) => {
      const {c, r} = getCell(e);
      if (c >= 0 && c < COLS && r >= 0 && r < ROWS) {
        let node = grid[c][r];
        if (node === startNode) draggingNode = 'start';
        else if (node === endNode) draggingNode = 'end';
        else {
          draggingNode = node.wall ? 'empty' : 'wall';
          node.wall = (draggingNode === 'wall');
          solveAlgorithm();
        }
      }
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener("pointermove", (e) => {
      const {c, r} = getCell(e);
      hoverC = c; hoverR = r;
      
      if (draggingNode && c >= 0 && c < COLS && r >= 0 && r < ROWS) {
        let node = grid[c][r];
        if (draggingNode === 'start' && node !== endNode && !node.wall) {
          if (startNode !== node) {
            startNode = node;
            solveAlgorithm();
          }
        } else if (draggingNode === 'end' && node !== startNode && !node.wall) {
          if (endNode !== node) {
            endNode = node;
            solveAlgorithm();
          }
        } else if (draggingNode === 'wall' || draggingNode === 'empty') {
          if (node !== startNode && node !== endNode) {
            const shouldBeWall = (draggingNode === 'wall');
            if (node.wall !== shouldBeWall) {
              node.wall = shouldBeWall;
              solveAlgorithm();
            }
          }
        }
      }
    });

    canvas.addEventListener("pointerup", () => {
      draggingNode = null;
    });

    canvas.addEventListener("pointerleave", () => {
      hoverC = -1; hoverR = -1;
    });

    initGrid();
    generateMaze();
    solveAlgorithm();
    initialized = true;
  }
  
  time += 0.05;

  // Background
  ctx.fillStyle = bkColor('bg');
  ctx.fillRect(0, 0, logicalW, logicalH);

  // Draw Grid
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      let node = grid[c][r];
      let x = c * cellW;
      let y = r * cellH;
      
      // Base cell
      let isDark = bkThemeMode() === "dark";
      
      if (isDark) {
        ctx.fillStyle = bkColor('paper');
      } else {
        // In light mode, paper often blends with the background. Add slight tint for empty cells.
        ctx.fillStyle = "rgba(0, 0, 0, 0.04)"; 
      }
      
      if (node.wall) {
        ctx.fillStyle = isDark ? bkColor('line') : "rgba(0, 0, 0, 0.15)";
      } else if (path.includes(node) && node !== startNode && node !== endNode) {
        // We pulse the path
        ctx.fillStyle = isDark ? "rgba(255, 200, 0, 0.4)" : "rgba(255, 180, 0, 0.7)";
      } else if (closedSet.includes(node)) {
        ctx.fillStyle = isDark ? "rgba(20, 50, 150, 0.2)" : "rgba(20, 80, 200, 0.25)";
      } else if (openSet.includes(node)) {
        ctx.fillStyle = isDark ? "rgba(0, 200, 255, 0.2)" : "rgba(0, 150, 255, 0.25)";
      }
      
      const ui = bkUi();
      
      if (ui === "neo") {
        if (node.wall) {
          // Neo Brutalist Wall
          ctx.fillStyle = bkColor('text');
          ctx.fillRect(x + 4, y + 4, cellW - 2, cellH - 2); // Hard shadow
          ctx.fillStyle = bkColor('line-strong');
          ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
          ctx.strokeStyle = bkColor('text');
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);
        } else {
          ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
          ctx.strokeStyle = bkColor('line');
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);
        }
      } else if (ui === "playful") {
        // Playful Rounded Wall
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 2, cellW - 4, cellH - 4, cellW * 0.3);
        ctx.fill();
        if (node.wall) {
          ctx.fillStyle = isDark ? bkColor('line-strong') : "rgba(0, 0, 0, 0.4)";
          ctx.beginPath();
          ctx.roundRect(x + 4, y + 4, cellW - 8, cellH - 8, cellW * 0.2);
          ctx.fill();
        }
      } else {
        // Standard sleek style
        ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
        if (node.wall) {
          ctx.fillStyle = isDark ? bkColor('line-strong') : "rgba(0, 0, 0, 0.35)";
          ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);
        }
      }

      // Draw start / end with glow
      if (node === startNode || node === endNode) {
        ctx.save();
        ctx.globalCompositeOperation = bkThemeMode() === "dark" ? "screen" : "source-over";
        
        let color = node === startNode ? "0, 255, 100" : "255, 50, 100";
        
        // Pulse animation
        let pulse = 2 + Math.sin(time) * 2;
        
        // Inner shape based on UI
        ctx.fillStyle = `rgba(${color}, 1)`;
        if (ui === "playful") {
          ctx.beginPath();
          ctx.arc(x + cellW/2, y + cellH/2, cellW/2 - 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (ui === "neo") {
          ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);
          ctx.strokeStyle = bkColor('text');
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 2, y + 2, cellW - 4, cellH - 4);
        } else {
          ctx.fillRect(x + 4, y + 4, cellW - 8, cellH - 8);
        }
        
        // Glow
        const glow = ctx.createRadialGradient(x+cellW/2, y+cellH/2, 0, x+cellW/2, y+cellH/2, cellW * 1.5);
        glow.addColorStop(0, `rgba(${color}, 0.8)`);
        glow.addColorStop(1, `rgba(${color}, 0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(x - cellW, y - cellH, cellW * 3, cellH * 3);
        
        ctx.restore();
      }

      // Hover
      if (c === hoverC && r === hoverR && !node.wall) {
        ctx.fillStyle = bkThemeMode() === "dark" ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.1)";
        ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
      }
    }
  }

  // Draw Path Line (Golden)
  if (algorithmDone && path.length > 0) {
    ctx.save();
    ctx.globalCompositeOperation = bkThemeMode() === "dark" ? "screen" : "source-over";
    ctx.lineCap = bkUi() === "neo" ? "square" : "round";
    ctx.lineJoin = bkUi() === "neo" ? "miter" : "round";
    
    // Animate dash to make it look like energy flowing
    ctx.setLineDash([15, 15]);
    ctx.lineDashOffset = -time * 20;
    
    ctx.beginPath();
    for (let i = 0; i < path.length; i++) {
      let node = path[i];
      let x = node.c * cellW + cellW / 2;
      let y = node.r * cellH + cellH / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    
    // Core line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = cellW * 0.3;
    ctx.stroke();
    
    // Glow line
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255, 200, 0, 0.6)";
    ctx.lineWidth = cellW * 0.6;
    ctx.stroke();
    
    ctx.restore();
  }

  // HUD
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = bkColor('text');
  ctx.font = "14px monospace";
  ctx.fillText("Drag START (Green) or END (Red). Drag space to draw WALLS.", 10, 20);
  if (noSolution) {
    ctx.fillStyle = "rgba(255, 50, 50, 0.9)";
    ctx.fillText("NO PATH FOUND!", 10, 40);
  } else if (algorithmDone) {
    ctx.fillStyle = "rgba(50, 255, 100, 0.9)";
    ctx.fillText(`Shortest Path Length: ${path.length} steps`, 10, 40);
  }
  ctx.restore();
}

window.bkSetup(1200, 800, draw);
