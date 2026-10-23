/**
 * Tasyir's WhatsApp contact (wa.me link) for the public home page.
 * NEXT_PUBLIC_WHATSAPP_NUMBER = international digits only, e.g. 2126XXXXXXXX.
 * Not set → no WhatsApp buttons are shown.
 */
export function whatsappUrl(message: string): string | null {
  const number = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, "");
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
