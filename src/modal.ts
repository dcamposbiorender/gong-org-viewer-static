// Modal management — plain functions, no class

const openModals = new Set<string>();

export function openModal(id: string): void {
  const el = document.getElementById(id);
  if (el) {
    el.style.display = 'flex';
    el.classList.add('active');
  }
  openModals.add(id);
}

export function closeModal(id: string): void {
  const el = document.getElementById(id);
  if (el) {
    el.style.display = 'none';
    el.classList.remove('active');
  }
  openModals.delete(id);
}

export function isAnyModalOpen(): boolean {
  return openModals.size > 0;
}
