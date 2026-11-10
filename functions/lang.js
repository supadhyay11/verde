// Tiny helper for emails that go to someone in English or Spanish.
// L(lang)(english, spanish) returns the right one.
function L(lang) {
  return (en, es) => (lang === "es" ? es : en)
}
module.exports = { L }
