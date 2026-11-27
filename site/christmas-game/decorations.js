"use strict";

const block = (left, top, right, bottom) => [[left, top], [right, top], [right, bottom], [left, bottom]];

function ellipsePoints(x, y, width, height, count = 14) {
  return Array.from({ length: count }, (_, index) => {
    const angle = index * Math.PI * 2 / count;
    return [x + Math.cos(angle) * width, y + Math.sin(angle) * height];
  });
}

function starPoints(x, y, radius) {
  return Array.from({ length: 10 }, (_, index) => {
    const angle = Math.PI * (index / 5 - 0.5);
    const length = index % 2 ? radius * 0.46 : radius;
    return [x + Math.cos(angle) * length, y + Math.sin(angle) * length];
  });
}

const starOutline = starPoints(0, 1, 24);
const starCentre = starOutline.filter((_, index) => index % 2);
const starTips = starCentre.map((point, index) =>
  [starOutline[index * 2], point, starCentre[(index + 4) % 5]]);

// Points are shared by the canvas artwork and the convex parts of the rigid body.
const pieces = [
  {
    name: "星のチャーム", radius: 18, light: "#ffdc77", points: 0,
    parts: [starCentre, ...starTips].map((points) => ({ points, color: "#f3b94f" })),
    outline: [{ points: starOutline, color: "#f3b94f" }]
  },
  {
    name: "丸いオーナメント", radius: 23, light: "#ff9e90", points: 3,
    parts: [
      { points: block(-6, -24, 6, -13), color: "#efd089" },
      { points: ellipsePoints(0, 3, 20, 19), color: "#cc424b" }
    ]
  },
  {
    name: "スノードーム", radius: 30, light: "#bce0e3", points: 8,
    parts: [
      { points: [[-22, 11], [-22, 3], [-19, -8], [-13, -17], [-6, -22], [6, -22], [13, -17], [19, -8], [22, 3], [22, 11]], color: "#b7dde0" },
      { points: [[-19, 9], [19, 9], [23, 21], [-23, 21]], color: "#b27150" }
    ]
  },
  {
    name: "プレゼント箱", radius: 38, light: "#ee9e8b", points: 15,
    parts: [
      { points: [[-3, -11], [-17, -18], [-13, -24], [-7, -22], [0, -12]], color: "#f6cb76" },
      { points: [[0, -12], [7, -22], [13, -24], [17, -18], [3, -11]], color: "#f6cb76" },
      { points: block(-20, -10, 20, 22), color: "#b63e4b" },
      { points: block(-23, -13, 23, -5), color: "#e3736b" }
    ]
  },
  {
    name: "雪だるま", radius: 47, light: "#e0e9d8", points: 25,
    parts: [
      { points: ellipsePoints(0, 9, 20, 15), color: "#edebd7" },
      { points: [[10, -2], [16, 1], [20, 10], [14, 11], [8, 4]], color: "#b7424a" },
      { points: ellipsePoints(-2, -8, 13, 12), color: "#fff5d9" },
      { points: block(-16, -19, 13, -15), color: "#313e40" },
      { points: block(-12, -25, 8, -17), color: "#344a49" }
    ]
  },
  {
    name: "サンタのそり", radius: 59, light: "#e68859", points: 40,
    parts: [
      { points: block(-16, -18, -2, -4), color: "#eac579" },
      { points: block(-3, -21, 9, -4), color: "#74a176" },
      { points: [[-24, -7], [11, -7], [16, 5], [11, 12], [-19, 12]], color: "#bf3f38" },
      { points: [[10, -5], [20, -13], [24, -12], [23, 0], [17, 10], [11, 12]], color: "#d45c43" },
      { points: block(-15, 10, -11, 18), color: "#b99053" },
      { points: block(9, 10, 13, 18), color: "#b99053" },
      { points: block(-22, 17, 17, 22), color: "#efd08e" },
      { points: [[13, 18], [23, 13], [25, 15], [17, 22], [13, 22]], color: "#efd08e" }
    ]
  },
  {
    name: "クリスマスツリー", radius: 74, light: "#a0c183", points: 65,
    parts: [
      { points: block(-5, 15, 5, 25), color: "#965c39" },
      { points: [[0, -10], [24, 18], [-24, 18]], color: "#387658" },
      { points: [[0, -19], [19, 9], [-19, 9]], color: "#4f9665" },
      { points: [[0, -25], [13, -2], [-13, -2]], color: "#71aa70" }
    ]
  }
];

function circle(ctx, x, y, radius, fill) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function shape(ctx, points, fill) {
  ctx.beginPath();
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function star(ctx, x, y, radius, fill) {
  shape(ctx, starPoints(x, y, radius), fill);
}

function paintDetails(ctx, level) {
  switch (level) {
    case 0:
      star(ctx, 0, 1, 16, "#ffe59a");
      break;
    case 1:
      star(ctx, 0, 3, 11, "#ffcc81");
      circle(ctx, -9, -5, 2.5, "#ffada3");
      break;
    case 2:
      shape(ctx, [[-11, 8], [0, -13], [10, 8]], "#599078");
      circle(ctx, 9, -9, 1.6, "#fffaf0");
      circle(ctx, -7, -7, 1.5, "#fffaf0");
      circle(ctx, 14, -1, 1.35, "#fffaf0");
      shape(ctx, block(-12, 13, 12, 15), "#e4b07a");
      break;
    case 3:
      shape(ctx, block(-3.5, -13, 3.5, 22), "#f8d67e");
      break;
    case 4:
      shape(ctx, block(-12, -1, 9, 3), "#c84e58");
      circle(ctx, -6, -9, 1.45, "#344a49");
      circle(ctx, 1, -9, 1.45, "#344a49");
      shape(ctx, [[-3, -7], [6, -5], [-3, -4]], "#e59448");
      circle(ctx, 0, 9, 1.6, "#526258");
      circle(ctx, 0, 16, 1.6, "#526258");
      break;
    case 5:
      shape(ctx, block(-11, -18, -8, -7), "#fff0b4");
      shape(ctx, block(1, -21, 4, -7), "#fff0b4");
      star(ctx, -6, 2, 5, "#ffd082");
      break;
    case 6:
      star(ctx, 0, -14, 4.6, "#ffe18a");
      circle(ctx, -6, -1, 2.3, "#fac35d");
      circle(ctx, 6, 4, 2.4, "#f38b78");
      circle(ctx, -13, 12, 2.4, "#f38b78");
      circle(ctx, 5, 13, 2.5, "#fac35d");
      break;
  }
}

function paintPiece(ctx, level, x, y, radius, { angle = 0, origin = { x: 0, y: 0 }, alpha = 1 } = {}) {
  const piece = pieces[level];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.translate(-origin.x, -origin.y);
  ctx.scale(radius / 25, radius / 25);
  ctx.strokeStyle = "#25342f";
  ctx.lineWidth = 0.85;
  ctx.lineJoin = "round";
  for (const part of piece.outline ?? piece.parts) {
    shape(ctx, part.points, part.color);
    ctx.stroke();
  }
  paintDetails(ctx, level);
  ctx.restore();
}
