import StockEdit from "@/components/StockEdit";

export default async function EditStockPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <StockEdit token={token} />;
}
