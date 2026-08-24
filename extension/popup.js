fetch("http://localhost:8000/health")
  .then((r) => r.json())
  .then(() => setStatus(true))
  .catch(() => setStatus(false));

function setStatus(ok) {
  const dot = document.querySelector(".dot");
  const text = document.getElementById("status-text");
  dot.classList.add(ok ? "ok" : "down");
  text.textContent = ok ? "Backend connected" : "Backend not reachable — is it running?";
}
