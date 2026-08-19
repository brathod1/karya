"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Info, KeyRound, UserPlus } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { ConfirmDialog, Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { changeMemberRoleAction, inviteMemberAction, issueResetLinkAction, removeMemberAction } from "@/server/actions/users";
import { ROLE_LABELS, type Role } from "@/lib/permissions";

type Member = {
  id: string; name: string | null; email: string;
  role: Role; pending: boolean; isSelf: boolean;
};

export function UsersManager({ members, currentRole, currentUserId }: {
  members: Member[]; currentRole: Role; currentUserId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("STAFF");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [resetLink, setResetLink] = useState<{ member: Member; url: string; ttlMinutes: number } | null>(null);

  const assignable: Role[] = currentRole === "OWNER" ? ["OWNER", "ADMIN", "STAFF", "VIEWER"] : ["ADMIN", "STAFF", "VIEWER"];

  async function invite() {
    setError(null);
    setBusy(true);
    const result = await inviteMemberAction({ email, role });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    toast.push(result.data.activatedImmediately
      ? "They already have an account — added straight away."
      : "Invitation saved. They'll join the moment they sign up with that email.");
    setEmail("");
    router.refresh();
  }

  return (
    <>
      <Card>
        <CardHeader title="Users" description="Who can get into this workspace, and what they can do." />
        <CardBody>
          <ul className="divide-y divide-line">
            {members.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-full bg-stone-200 text-[12px] font-semibold text-ink-muted">
                  {(member.name ?? member.email).slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium">
                    {member.name ?? "Invited"}
                    {member.isSelf ? <span className="ml-1.5 text-[11.5px] font-normal text-ink-subtle">you</span> : null}
                  </p>
                  <p className="truncate text-[12px] text-ink-subtle">{member.email}</p>
                </div>

                {member.pending ? <Badge color="amber">Pending sign-up</Badge> : null}

                <Select
                  aria-label={`Role for ${member.email}`}
                  className="h-8 w-[110px] text-[13px]"
                  value={member.role}
                  disabled={busy || (member.role === "OWNER" && currentRole !== "OWNER")}
                  onChange={async (e) => {
                    const result = await changeMemberRoleAction(member.id, e.target.value);
                    if (result.ok) { toast.push("Role updated"); router.refresh(); }
                    else toast.push(result.error, "error");
                  }}
                >
                  {[...new Set([...assignable, member.role])].map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </Select>

                {!member.pending ? (
                  <Button
                    variant="ghost" size="sm" loading={busy}
                    title="Create a password reset link to give them"
                    onClick={async () => {
                      setBusy(true);
                      const result = await issueResetLinkAction(member.id);
                      setBusy(false);
                      if (!result.ok) { toast.push(result.error, "error"); return; }
                      setResetLink({
                        member,
                        url: `${window.location.origin}${result.data.path}`,
                        ttlMinutes: result.data.ttlMinutes,
                      });
                    }}
                  >
                    <KeyRound className="size-3.5" />Reset
                  </Button>
                ) : null}

                <Button
                  variant="ghost" size="sm" disabled={member.isSelf}
                  onClick={() => setRemoving(member)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>

          <div className="mt-5 rounded-xl bg-stone-50 p-3 ring-1 ring-line">
            <p className="mb-2 flex items-center gap-1.5 text-[13px] font-medium"><UserPlus className="size-3.5" />Invite someone</p>
            {error ? <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-800 ring-1 ring-red-200">{error}</p> : null}
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Email" className="min-w-[220px] flex-1">
                <Input type="email" value={email} placeholder="helper@example.com"
                  onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") invite(); }} />
              </Field>
              <Field label="Role" className="w-[140px]">
                <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  {assignable.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </Select>
              </Field>
              <Button onClick={invite} loading={busy} disabled={!email.trim()}>Invite</Button>
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-[12px] text-ink-subtle">
              <Info className="mt-px size-3.5 shrink-0" />
              No email is sent — this app has no mail service. The invitation is stored, and the person joins
              automatically the first time they sign in or register with that address. Tell them yourself.
            </p>
          </div>
        </CardBody>
      </Card>

      <Sheet
        open={!!resetLink} onClose={() => setResetLink(null)} width="md"
        title="Password reset link"
        description={resetLink ? `For ${resetLink.member.email}` : undefined}
        footer={<Button variant="secondary" onClick={() => setResetLink(null)}>Done</Button>}
      >
        {resetLink ? (
          <div className="space-y-4">
            <p className="text-[13px] text-ink-muted">
              Send this to them however you normally talk — WhatsApp, a message, in person.
              It works once, expires in {resetLink.ttlMinutes} minutes, and signs them out everywhere when used.
            </p>
            <div className="flex gap-2">
              <input
                readOnly value={resetLink.url}
                onFocus={(e) => e.currentTarget.select()}
                className="h-10 w-full rounded-lg bg-stone-50 px-3 font-mono text-[12px] ring-1 ring-line-strong"
              />
              <Button
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(resetLink.url);
                  toast.push("Link copied");
                }}
              >
                <Copy className="size-3.5" />Copy
              </Button>
            </div>
            <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-900 ring-1 ring-amber-200">
              Anyone holding this link can set that password, so don't post it anywhere public.
            </p>
          </div>
        ) : null}
      </Sheet>

      <ConfirmDialog
        open={!!removing} onClose={() => setRemoving(null)} danger loading={busy}
        title="Remove this person?"
        message={`${removing?.email ?? ""} will lose access to this workspace immediately. Everything they created stays exactly as it is.`}
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!removing) return;
          setBusy(true);
          const result = await removeMemberAction(removing.id);
          setBusy(false);
          setRemoving(null);
          if (result.ok) { toast.push("Removed"); router.refresh(); }
          else toast.push(result.error, "error");
        }}
      />
    </>
  );
}
