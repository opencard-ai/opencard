import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lang = searchParams.get("lang") || "en";

  try {
    const filePath = path.join(process.cwd(), "data/news.json");
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(fileContent);

    // Filter and map based on requested language
    const localizedItems = data.items.map((item: any) => ({
      ...item,
      title: item[`title_${lang}`] || item.title_en || item.title,
      summary: item[`summary_${lang}`] || "",
    }));

    return NextResponse.json({ 
      items: localizedItems, 
      fetched: data.fetched 
    });
  } catch (error) {
    console.error("Failed to read news data:", error);
    return NextResponse.json({ items: [], error: "Data unavailable" }, { status: 500 });
  }
}
