import IndexView from "@/components/IndexView";

export default async function IndexViewPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return <IndexView symbol={symbol} />;
}
