"use strict";

function drawArrow(ctx, fromX, fromY, toX, toY, { color = "#46796d", head = 9 } = {}) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.lineTo(toX - Math.cos(angle - 0.68) * head, toY - Math.sin(angle - 0.68) * head);
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - Math.cos(angle + 0.68) * head, toY - Math.sin(angle + 0.68) * head);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function drawRuleTray(ctx, top, bottom) {
  ctx.fillStyle = "#fff9df";
  ctx.fillRect(53, top, 134, bottom - top);
  ctx.beginPath();
  ctx.moveTo(53, top);
  ctx.lineTo(53, bottom);
  ctx.lineTo(187, bottom);
  ctx.lineTo(187, top);
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#518b7b";
  ctx.stroke();
}

function drawDropRule(ctx) {
  drawRuleTray(ctx, 51, 110);
  paintPiece(ctx, 0, 120, 28, 23);
  paintPiece(ctx, 0, 120, 93, 19, { alpha: 0.48 });
  drawArrow(ctx, 87, 27, 53, 27);
  drawArrow(ctx, 153, 27, 187, 27);
  drawArrow(ctx, 120, 55, 120, 69);
}

function drawMergeRule(ctx) {
  paintPiece(ctx, 0, 134, 40, 27);
  paintPiece(ctx, 0, 220, 40, 27);
  ctx.strokeStyle = "#46796d";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(170, 40);
  ctx.lineTo(184, 40);
  ctx.moveTo(177, 33);
  ctx.lineTo(177, 47);
  ctx.stroke();
  drawArrow(ctx, 266, 40, 317, 40);
  paintPiece(ctx, 1, 366, 41, 35);
}

function drawGrowthRule(ctx) {
  pieces.forEach((_, index) => {
    const x = 35 + index * 80;
    const radius = 18 + index * 2.9;
    paintPiece(ctx, index, x, 40, radius);
    if (index < pieces.length - 1) {
      drawArrow(ctx, x + 32, 40, x + 48, 40, { head: 6 });
    }
  });
}

function drawOverflowRule(ctx) {
  drawRuleTray(ctx, 51, 113);
  paintPiece(ctx, 2, 157, 91, 24, { angle: -0.18 });
  paintPiece(ctx, 3, 91, 84, 30);
  paintPiece(ctx, 1, 113, 43, 26, { angle: 0.22 });

  ctx.beginPath();
  ctx.setLineDash([8, 6]);
  ctx.moveTo(53, 51);
  ctx.lineTo(187, 51);
  ctx.strokeStyle = "#a92c46";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);

  circle(ctx, 209, 51, 16, "#a92c46");
  ctx.beginPath();
  ctx.moveTo(203, 45);
  ctx.lineTo(215, 57);
  ctx.moveTo(215, 45);
  ctx.lineTo(203, 57);
  ctx.strokeStyle = "#fff8e8";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.stroke();
}

function drawWelcomeArt(ctx) {
  const sky = ctx.createLinearGradient(0, 0, 0, 430);
  sky.addColorStop(0, "#c7eee0");
  sky.addColorStop(1, "#eaf8ec");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 880, 430);

  circle(ctx, 435, 182, 142, "#fff5d4");
  ctx.fillStyle = "#f9fcf0";
  ctx.beginPath();
  ctx.moveTo(0, 355);
  ctx.quadraticCurveTo(180, 295, 366, 350);
  ctx.quadraticCurveTo(620, 398, 880, 316);
  ctx.lineTo(880, 430);
  ctx.lineTo(0, 430);
  ctx.closePath();
  ctx.fill();

  for (const [x, y, size] of [[92, 127, 6], [142, 60, 9], [257, 97, 5], [313, 41, 5], [522, 55, 7], [626, 125, 5], [720, 53, 7], [788, 144, 9], [835, 78, 4], [58, 253, 7], [821, 299, 5]]) {
    circle(ctx, x, y, size, "#f9fff3");
  }

  ctx.fillStyle = "#89bca64b";
  ctx.beginPath();
  ctx.ellipse(435, 375, 296, 24, 0, 0, Math.PI * 2);
  ctx.fill();

  paintPiece(ctx, 2, 235, 300, 77, { angle: -0.12 });
  paintPiece(ctx, 6, 452, 210, 153, { angle: 0.035 });
  paintPiece(ctx, 3, 611, 307, 65, { angle: 0.1 });
  paintPiece(ctx, 1, 702, 340, 36, { angle: -0.2 });
  paintPiece(ctx, 0, 690, 158, 43, { angle: 0.22 });
  star(ctx, 186, 181, 12, "#ed9b53");
  star(ctx, 752, 227, 10, "#e5a25e");
}

drawWelcomeArt(document.getElementById("welcome-art").getContext("2d"));
drawDropRule(document.getElementById("rule-drop").getContext("2d"));
drawMergeRule(document.getElementById("rule-merge").getContext("2d"));
drawGrowthRule(document.getElementById("rule-growth").getContext("2d"));
drawOverflowRule(document.getElementById("rule-overflow").getContext("2d"));
