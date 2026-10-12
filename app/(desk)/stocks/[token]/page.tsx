import ChartPanel from "@/components/ChartPanel";

export default async function StockViewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ChartPanel token={token} date="" backHref="/stocks" />;
}
