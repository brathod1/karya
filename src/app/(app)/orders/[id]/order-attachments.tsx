"use client";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { AttachmentPanel } from "@/components/attachments";
import { useConfig } from "@/components/config-provider";

export function OrderAttachments({ orderId }: { orderId: string }) {
  const { can } = useConfig();
  return (
    <Card>
      <CardHeader title="Files" description="Reference photos, delivery proof, anything worth keeping." />
      <CardBody>
        <AttachmentPanel entityType="ORDER" entityId={orderId} label="Attached" canEdit={can("order:update")} />
      </CardBody>
    </Card>
  );
}
