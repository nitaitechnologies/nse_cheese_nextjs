import IndexEdit from "@/components/IndexEdit";

export default async function IndexEditPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return <IndexEdit symbol={symbol} />;
}
