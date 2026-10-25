import { AuthFrame } from "@/components/auth-frame";
import { getInvite } from "@/lib/businesses";
import { InviteForm } from "./invite-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await getInvite(token);
  if (!inv || inv.accepted || inv.expired) {
    return (
      <AuthFrame storeName="ÌṢÚRA" title={inv?.accepted ? "Invitation already used" : "Invitation not valid"}
        subtitle={inv?.accepted ? "This invitation has been accepted. Sign in with your email and password." : inv?.expired ? "This invitation has expired. Ask ÌṢÚRA to send you a new one." : "This link isn't valid. Check you opened the latest invitation email."}>
        <a href="/login" className="inline-flex h-12 items-center rounded-full bg-[#111111] px-6 text-sm font-semibold text-white">Go to sign in</a>
      </AuthFrame>
    );
  }
  const what = inv.role === "owner" ? `You're the new owner of ${inv.business}` : `Join ${inv.business}`;
  return (
    <AuthFrame storeName="ÌṢÚRA" title={what}
      subtitle={inv.existing_user ? `Confirm with the password for ${inv.email} to accept.` : `Set up your account for ${inv.email}.`}>
      <InviteForm token={token} email={inv.email} existing={inv.existing_user} />
    </AuthFrame>
  );
}
