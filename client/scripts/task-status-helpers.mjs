export async function chooseTaskStatus(root, title, status) {
  const page = typeof root.page === 'function' ? root.page() : root;
  await root.getByRole('button', { name: `Cambiar estado de ${title}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Cambiar estado', exact: true });
  await dialog.getByRole('button', { name: status.name, exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
}
