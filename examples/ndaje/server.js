// Ndaje: Awa's small shop, as an example app for a room. Prices in FCFA, and a "pay by mobile money" button that
// is a mock: it says so, and no money moves. A real shop would hand the payment to an aggregator (PayDunya, CinetPay,
// FedaPay or Kkiapay). PORT and COLOC_COUNTRY come from La Coloc (see examples/hello).
const http = require("node:http");

const port = Number(process.env.PORT || 3000);
const country = process.env.COLOC_COUNTRY || "SN";

const PRODUCTS = [
  { name: "Bissap, one litre", price: 1000 },
  { name: "Café Touba, 250 g", price: 1500 },
  { name: "Thiakry, a family pot", price: 2000 },
  { name: "Shea butter, 200 g", price: 2500 },
  { name: "Wax print, six yards", price: 12000 },
];

// The usual ways to pay where the shop is. Names only: no logos.
const OPERATORS = {
  SN: ["Wave", "Orange Money", "Free Money"],
  CI: ["Orange Money", "MTN MoMo", "Moov Money", "Wave"],
  TG: ["T-Money", "Flooz"],
  BJ: ["MTN MoMo", "Moov Money"],
  CM: ["MTN MoMo", "Orange Money"],
  RW: ["MTN MoMo", "Airtel Money"],
};
const operators = OPERATORS[country] || OPERATORS.SN;
const fcfa = (n) => `${new Intl.NumberFormat("fr-FR").format(n)} FCFA`;
const sentence = (list) => (list.length > 1 ? `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}` : list[0]);

function page() {
  const items = PRODUCTS.map(
    (p, i) => `<li><label><input type="checkbox" value="${p.price}" ${i < 2 ? "checked" : ""}> <span>${p.name}</span><b>${fcfa(p.price)}</b></label></li>`,
  ).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ndaje</title>
<style>
  :root { color-scheme: light dark; --bg: #fbf7f0; --ink: #1d1b18; --soft: #6b655c; --line: #e6dfd2; --act: #1f6f5c; }
  @media (prefers-color-scheme: dark) { :root { --bg: #14130f; --ink: #f2efe8; --soft: #a39d92; --line: #2c2a24; --act: #3fae90; } }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  main { max-width: 32rem; margin: 0 auto; padding: 48px 20px; }
  h1 { font-size: 3rem; margin: 0 0 8px; letter-spacing: -0.02em; }
  p { font-size: 1.15rem; line-height: 1.5; color: var(--soft); margin: 0 0 28px; }
  ul { list-style: none; margin: 0 0 28px; padding: 0; }
  li label { display: flex; gap: 12px; align-items: center; padding: 16px 0; border-bottom: 1px solid var(--line); font-size: 1.1rem; cursor: pointer; }
  li span { flex: 1; }
  input { width: 20px; height: 20px; accent-color: var(--act); }
  button { width: 100%; padding: 16px; border: 0; border-radius: 14px; background: var(--act); color: #fff; font: inherit; font-size: 1.15rem; font-weight: 600; cursor: pointer; }
  #said { margin-top: 20px; min-height: 3em; }
</style>
</head>
<body>
<main>
  <h1>Ndaje</h1>
  <p>Good things from the market, brought to your door in Dakar.</p>
  <ul>${items}</ul>
  <button id="pay" type="button">Pay <span id="total"></span> by mobile money</button>
  <p id="said" role="status"></p>
</main>
<script>
  const boxes = [...document.querySelectorAll("input")];
  const fcfa = (n) => new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
  const total = () => boxes.filter((b) => b.checked).reduce((s, b) => s + Number(b.value), 0);
  const show = () => (document.getElementById("total").textContent = fcfa(total()));
  boxes.forEach((b) => b.addEventListener("change", show));
  show();
  document.getElementById("pay").addEventListener("click", () => {
    document.getElementById("said").textContent = total()
      ? "This is a demo shop, so no money moved. A real one would ask you to confirm " + fcfa(total()) + " with ${sentence(operators)}."
      : "Pick something first.";
  });
</script>
</body>
</html>`;
}

http
  .createServer((req, res) => {
    if ((req.headers.accept || "").includes("text/html")) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(page());
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ shop: "Ndaje", currency: "XOF", products: PRODUCTS, pay: operators }));
  })
  .listen(port, () => console.log(`ndaje: the shop is open on ${port}`));
