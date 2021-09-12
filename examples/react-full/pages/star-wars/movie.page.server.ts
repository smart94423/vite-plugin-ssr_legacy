import fetch from "node-fetch";
import { filterMovieData } from "./filterMovieData";
import type { PageContextBuiltIn } from "vite-plugin-ssr/types";
import type { MovieDetails } from "./types";

export { onBeforeRender };

async function onBeforeRender(pageContext: PageContextBuiltIn) {
  const response = await fetch(
    `https://star-wars.brillout.com/api/films/${pageContext.routeParams.movieId}.json`
  );
  let movie = (await response.json()) as MovieDetails;

  // We remove data we don't need because we pass `pageContext.movie` to
  // the client; we want to minimize what is sent over the network.
  movie = filterMovieData(movie);

  const { title } = movie;

  return {
    pageContext: {
      pageProps: {
        movie,
      },
      documentProps: {
        // The page's <title>
        title,
      },
    },
  };
}
