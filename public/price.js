// Formats a typed price as US dollars: "10" → "$10.00", "$1,234.5" → "$1,234.50".
// Anything that isn't a plain amount ("€20", "$10–$20", "around 15") is left as typed.
// Shared by the admin page (browser) and the tests (Node).
(function (root) {
  const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

  function formatUsd(value) {
    const raw = String(value ?? '').trim();
    const plain = raw.replace(/^\$\s*/, '').replace(/,(?=\d{3}(\D|$))/g, '');
    if (!/^(\d+(\.\d*)?|\.\d+)$/.test(plain)) return raw;
    return USD.format(Number(plain));
  }

  const api = { formatUsd };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.giftPrice = api;
})(typeof window !== 'undefined' ? window : globalThis);
