"use client";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { chartColor } from "@/lib/colors";
import { useConfig } from "@/components/config-provider";

type Point = { label: string; revenue: number; collected: number; expenses: number; orders: number };
type Slice = { name: string; value: number };

export function AnalyticsCharts({ series, productSales, categorySales, expenseSplit, currencySymbol }: {
  series: Point[]; productSales: Slice[]; categorySales: Slice[]; expenseSplit: Slice[]; currencySymbol: string;
}) {
  const { t } = useConfig();
  const fmt = (value: number) => `${currencySymbol}${value.toLocaleString("en-IN")}`;
  const compact = (value: number) => `${currencySymbol}${value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : value}`;
  const tooltip = { borderRadius: 10, border: "1px solid #E7E5E4", fontSize: 13 };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={`Revenue, collected and ${t("expense", "many").toLowerCase()}`} description="Last 12 months." />
          <CardBody>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#78716C" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={compact} tick={{ fontSize: 12, fill: "#78716C" }} axisLine={false} tickLine={false} width={56} />
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={tooltip} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenue" name="Sales" fill="#0F766E" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="collected" name="Collected" fill="#5EEAD4" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name={t("expense", "many")} fill="#D97706" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={`${t("order", "many")} over time`} />
          <CardBody>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#78716C" }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#78716C" }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip contentStyle={tooltip} />
                  <Line type="monotone" dataKey="orders" name={t("order", "many")} stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SliceCard title={`Sales by ${t("product").toLowerCase()}`} data={productSales} fmt={fmt} horizontal />
        <SliceCard title="Sales by category" data={categorySales} fmt={fmt} />
        <SliceCard title={`${t("expense", "many")} by category`} data={expenseSplit} fmt={fmt} />
      </div>
    </div>
  );
}

function SliceCard({ title, data, fmt, horizontal }: {
  title: string; data: Slice[]; fmt: (v: number) => string; horizontal?: boolean;
}) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader title={title} />
        <CardBody><p className="text-[13px] text-ink-subtle">No data yet.</p></CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title={title} />
      <CardBody>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            {horizontal ? (
              <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11.5, fill: "#57534E" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: 10, border: "1px solid #E7E5E4", fontSize: 13 }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {data.map((_, i) => <Cell key={i} fill={chartColor(i)} />)}
                </Bar>
              </BarChart>
            ) : (
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={78} paddingAngle={2}>
                  {data.map((_, i) => <Cell key={i} fill={chartColor(i)} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: 10, border: "1px solid #E7E5E4", fontSize: 13 }} />
                <Legend wrapperStyle={{ fontSize: 11.5 }} />
              </PieChart>
            )}
          </ResponsiveContainer>
        </div>
      </CardBody>
    </Card>
  );
}
