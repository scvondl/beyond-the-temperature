const menu = document.getElementById('menu');
const navigation = document.querySelector('.nav nav');
if (menu && navigation) {
  menu.setAttribute('aria-expanded', 'false');
  menu.addEventListener('click', () => {
    menu.setAttribute('aria-expanded', String(navigation.classList.toggle('open')));
  });
  navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    navigation.classList.remove('open');
    menu.setAttribute('aria-expanded', 'false');
  }));
}
