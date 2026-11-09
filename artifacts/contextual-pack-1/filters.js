const form = document.querySelector('#filters');
const cards = [...document.querySelectorAll('article[data-target]')];
const status = document.querySelector('#visible-count');
const params = new URLSearchParams(location.search);
for (const control of form.elements) if (control.name && params.has(control.name)) control.value = params.get(control.name);
function update() {
  let count = 0;
  for (const card of cards) {
    const match = [...form.elements].every(control => !control.name || !control.value || card.dataset[control.name] === control.value);
    card.hidden = !match;
    if (match) count++;
  }
  status.textContent = count + ' sentence contexts · ' + count * 2 + ' questions shown';
  const url = new URL(location.href);
  for (const control of form.elements) if (control.name) {
    if (control.value) url.searchParams.set(control.name, control.value); else url.searchParams.delete(control.name);
  }
  history.replaceState(null, '', url);
}
form.addEventListener('change', update);
update();
