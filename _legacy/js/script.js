document.addEventListener('DOMContentLoaded', function () {
  const burger = document.querySelector('.burger-menu');
  const navLinks = document.querySelector('.nav-left ul');

  burger.addEventListener('click', function () {
    navLinks.classList.toggle('active');
  });
});
