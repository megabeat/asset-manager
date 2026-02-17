export function isPensionCategory(category?: string): boolean {
  return (
    category === 'pension' ||
    category === 'pension_national' ||
    category === 'pension_personal' ||
    category === 'pension_retirement' ||
    category === 'pension_government'
  );
}
