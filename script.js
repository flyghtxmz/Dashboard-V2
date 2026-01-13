const chart = document.getElementById("orders-chart");

if (chart) {
  const ctx = chart.getContext("2d");
  const dataA = [38, 52, 44, 60, 48, 70, 58];
  const dataB = [6, 8, 5, 7, 4, 6, 5];
  const labels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];
  const padding = 32;

  const width = chart.width - padding * 2;
  const height = chart.height - padding * 2;

  const maxValue = Math.max(...dataA, ...dataB) + 10;

  function drawLine(series, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();

    series.forEach((value, index) => {
      const x = padding + (width / (series.length - 1)) * index;
      const y = padding + height - (value / maxValue) * height;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    series.forEach((value, index) => {
      const x = padding + (width / (series.length - 1)) * index;
      const y = padding + height - (value / maxValue) * height;
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  function drawGrid() {
    ctx.strokeStyle = "rgba(108, 98, 85, 0.2)";
    ctx.lineWidth = 1;

    for (let i = 0; i <= 4; i += 1) {
      const y = padding + (height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + width, y);
      ctx.stroke();
    }
  }

  function drawLabels() {
    ctx.fillStyle = "#6c6255";
    ctx.font = "12px Trebuchet MS";

    labels.forEach((label, index) => {
      const x = padding + (width / (labels.length - 1)) * index;
      ctx.fillText(label, x - 10, padding + height + 20);
    });
  }

  ctx.clearRect(0, 0, chart.width, chart.height);
  drawGrid();
  drawLine(dataA, "#d1543b");
  drawLine(dataB, "#2c6e63");
  drawLabels();
}
