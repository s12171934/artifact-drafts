const canvas = document.getElementById("sampleChart");
let chart;
function drawChart() {
  const css = getComputedStyle(document.documentElement);
  const token = (name) => css.getPropertyValue(name).trim();
  Chart.defaults.color = token("--muted");
  Chart.defaults.borderColor = token("--rule");
  if (chart) chart.destroy();
  chart = new Chart(canvas, {
    type: "bar",
    data: { labels: ["월", "화", "수", "목", "금"], datasets: [{ label: "예시 값", data: [3, 7, 4, 8, 5], backgroundColor: token("--accent") }] },
  });
}
drawChart();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", drawChart);
new MutationObserver(drawChart).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
