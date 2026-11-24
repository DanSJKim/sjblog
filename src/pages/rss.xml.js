import rss from "@astrojs/rss";
import { getCollection } from "astro:content";

export async function GET(context) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const posts = (await getCollection("posts")).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
  );

  return rss({
    title: "Daniel's Posts",
    description: "프론트엔드 개발을 하며 배운 것과 고민한 것을 적어둔 블로그입니다.",
    site: new URL(`${base}/`, context.site),
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `${base}/posts/${post.id}/`,
      categories: post.data.tags,
    })),
    customData: "<language>ko-KR</language>",
  });
}
