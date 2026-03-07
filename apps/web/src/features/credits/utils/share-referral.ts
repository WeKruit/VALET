export function buildReferralLink(code: string): string {
  return `${window.location.origin}/login?ref=${code}`;
}

export function shareOnTwitter(referralLink: string): void {
  const text = encodeURIComponent(
    "I'm using WeKruit Valet for AI job applications. Sign up with my link and we both earn credits!",
  );
  window.open(
    `https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(referralLink)}`,
    "_blank",
  );
}

export function shareOnLinkedIn(referralLink: string): void {
  window.open(
    `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralLink)}`,
    "_blank",
  );
}

export function shareOnWhatsApp(referralLink: string): void {
  const text = encodeURIComponent(
    `Check out WeKruit Valet for automated job applications! Sign up with my referral link: ${referralLink}`,
  );
  window.open(`https://wa.me/?text=${text}`, "_blank");
}

export function shareViaEmail(referralLink: string): void {
  const subject = encodeURIComponent("Try WeKruit Valet");
  const body = encodeURIComponent(
    `Hey! I'm using WeKruit Valet for AI-powered job applications. Sign up with my referral link and we both get bonus credits:\n\n${referralLink}`,
  );
  window.open(`mailto:?subject=${subject}&body=${body}`);
}

export function sendEmailInvite(email: string, referralLink: string): void {
  const subject = encodeURIComponent("Join me on WeKruit Valet");
  const body = encodeURIComponent(
    `Hey! I'm using WeKruit Valet for AI-powered job applications. Sign up with my referral link and we both get bonus credits:\n\n${referralLink}`,
  );
  window.open(`mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`);
}
