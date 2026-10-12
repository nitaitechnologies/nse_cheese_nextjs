import ChartPanel from "@/components/ChartPanel";

export default async function ChartPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { token } = await params;
  const { date } = await searchParams;
  return <ChartPanel token={token} date={date ?? ""} />;
}
