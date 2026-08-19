"use client";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function RevenueChart({ data, currencySymbol, expenseLabel }: {
  data: { label: string; revenue: number; collected: number; expenses: number }[];
  currencySymbol: string;
  expenseLabel: string;
}) {
  const compact = (value: number) =>
    `${currencySymbol}${value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : value}`;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0F766E" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#0F766E" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#D97706" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#D97706" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#78716C" }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={compact} tick={{ fontSize: 12, fill: "#78716C" }} axisLine={false} tickLine={false} width={56} />
          <Tooltip
            formatter={(value: number, name: string) => [`${currencySymbol}${value.toLocaleString("en-IN")}`, name]}
            contentStyle={{ borderRadius: 10, border: "1px solid #E7E5E4", fontSize: 13 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="revenue" name="Sales" stroke="#0F766E" strokeWidth={2} fill="url(#revenueFill)" />
          <Area type="monotone" dataKey="expenses" name={expenseLabel} stroke="#D97706" strokeWidth={2} fill="url(#expenseFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
