"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardBody } from "./ui/card";
import { Field, Input, Textarea } from "./ui/field";
import { MoneyInput } from "./money-input";
import { useConfig } from "./config-provider";
import { useToast } from "./ui/toast";
import { createEventAction, updateEventAction } from "@/server/actions/entities";

export type EventInitial = {
  id: string; name: string; startDate: string; endDate: string;
  location: string | null; notes: string | null; budgetMinor: number | null;
};

export function EventForm({ initial }: { initial?: EventInitial }) {
  const { t } = useConfig();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [budgetMinor, setBudgetMinor] = useState(initial?.budgetMinor ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSaving(true);
    const payload = {
      name,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      location: location || null, notes: notes || null,
      budgetMinor: budgetMinor || null,
    };
    if (initial) {
      const result = await updateEventAction(initial.id, payload);
      setSaving(false);
      if (!result.ok) { setError(result.error); return; }
      toast.push("Saved");
      router.push(`/events/${initial.id}`);
    } else {
      const result = await createEventAction(payload);
      setSaving(false);
      if (!result.ok) { setError(result.error); return; }
      toast.push(`${name} created`);
      router.push(`/events/${result.data.id}`);
    }
    router.refresh();
  }

  return (
    <div className="max-w-2xl space-y-4">
      {error ? (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-800 ring-1 ring-red-200">
          <AlertCircle className="size-4 mt-px shrink-0" />{error}
        </p>
      ) : null}
      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2 pt-5">
          <Field label="Name" required className="sm:col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ahmedabad University Fest" autoFocus />
          </Field>
          <Field label="Starts"><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
          <Field label="Ends"><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
          <Field label="Location" className="sm:col-span-2"><Input value={location} onChange={(e) => setLocation(e.target.value)} /></Field>
          <Field label="Budget" help="Optional — stall fees, travel, materials."><MoneyInput valueMinor={budgetMinor} onChange={setBudgetMinor} /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </CardBody>
      </Card>
      <div className="flex gap-2">
        <Button onClick={submit} loading={saving} size="lg">{initial ? "Save changes" : `Create ${t("event").toLowerCase()}`}</Button>
        <Button variant="secondary" size="lg" onClick={() => router.back()}>Cancel</Button>
      </div>
    </div>
  );
}
