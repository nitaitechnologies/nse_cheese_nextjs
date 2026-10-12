import { getClient } from "../lib/mongo";
import { syncConstituents } from "../worker/constituents";

async function main(): Promise<void> {
  const book = await syncConstituents();
  console.log(
    JSON.stringify(
      {
        indices: book.indices,
        stocks: book.stocks,
        links: book.links,
        missing: book.missing,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getClient().close();
  });
