for (const button of document.querySelectorAll('.copy-ca')) {
  button.addEventListener('click', async () => {
    const status = button.closest('.token-launch').querySelector('.copy-status');
    try {
      await navigator.clipboard.writeText(button.dataset.ca);
      status.textContent = '[ CA COPIED ]';
    } catch {
      status.textContent = '[ COPY UNAVAILABLE / SELECT THE ADDRESS ABOVE ]';
    }
  });
}
