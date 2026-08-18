import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { getLatest, listNovels } from "../lib/api";

const Shimmer = () => (
  <div
    className="absolute top-0 bottom-0 left-0 z-10 w-[150%] animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent"
    style={{ transform: "translate3d(-100%,0,0) skewX(-20deg)" }}
  />
);

const CardSkeleton = () => (
  <div className="flex min-w-[105px] flex-col gap-2">
    <div className="relative aspect-[3/4.5] overflow-hidden rounded-sm bg-[#16161a] shadow-xl">
      <Shimmer />
    </div>
    <div className="relative h-2.5 w-3/4 overflow-hidden rounded-sm bg-[#16161a]">
      <Shimmer />
    </div>
  </div>
);

const Arrow = ({ direction }) => (
  <svg
    className="h-5 w-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d={direction === "prev" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"}
    />
  </svg>
);

const toNumber = value => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    typeof value === "string" &&
    value.trim() !== "" &&
    Number.isFinite(Number(value))
  )
    return Number(value);
  return null;
};

const readFirstNumber = (item, keys) => {
  for (const key of keys) {
    const value = toNumber(item?.[key]);
    if (value !== null) return value;
  }
  return null;
};

const formatMetric = value => {
  if (Number.isInteger(value))
    return new Intl.NumberFormat("id-ID", {
      notation: value >= 10000 ? "compact" : "standard",
      maximumFractionDigits: 1,
    }).format(value);
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(
    value
  );
};

const getMetrics = novel => {
  const metrics = [
    {
      label: "Dibaca",
      value: readFirstNumber(novel, [
        "views",
        "view_count",
        "total_views",
        "reads",
        "read_count",
      ]),
    },
    {
      label: "Chapter",
      value: readFirstNumber(novel, [
        "count",
        "chapter_count",
        "chapters_count",
        "total_chapters",
      ]),
    },
    {
      label: "Rating",
      value: readFirstNumber(novel, ["rating", "average_rating", "score"]),
    },
  ];
  return metrics.filter(metric => metric.value !== null);
};

function NovelHeroCarousel({ items = [], isLoading, navigate }) {
  const trackRef = useRef(null);
  const activeRef = useRef(0);
  const dragRef = useRef({ active: false, startX: 0, startScrollLeft: 0 });
  const settleTimerRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const count = items.length;

  const selectIndex = index => {
    if (!count) return;
    const safeIndex = (index + count) % count;
    activeRef.current = safeIndex;
    setActiveIndex(safeIndex);
  };

  const centerElement = (element, instant = false) => {
    const track = trackRef.current;
    if (!track || !element) return;
    track.scrollTo({
      left: element.offsetLeft - (track.clientWidth - element.clientWidth) / 2,
      behavior: instant ? "auto" : "smooth",
    });
  };

  const centerReal = (index, instant = false) => {
    const card = trackRef.current?.querySelector(
      `[data-hero-index="${index}"]:not([data-hero-clone])`
    );
    centerElement(card, instant);
  };

  const goTo = index => {
    if (!count) return;
    const safeIndex = (index + count) % count;
    selectIndex(safeIndex);
    centerReal(safeIndex);
  };

  const goNext = () => {
    if (count < 2) return;
    const current = activeRef.current;
    if (current === count - 1) {
      selectIndex(0);
      centerElement(
        trackRef.current?.querySelector('[data-hero-clone="head"]')
      );
    } else goTo(current + 1);
  };

  const goPrevious = () => {
    if (count < 2) return;
    const current = activeRef.current;
    if (current === 0) {
      selectIndex(count - 1);
      centerElement(
        trackRef.current?.querySelector('[data-hero-clone="tail"]')
      );
    } else goTo(current - 1);
  };

  const settle = () => {
    const track = trackRef.current;
    if (!track || !count) return;
    const midpoint = track.scrollLeft + track.clientWidth / 2;
    const cards = [...track.querySelectorAll("[data-hero-index]")];
    const closest = cards.reduce((best, card) => {
      const currentDistance = Math.abs(
        card.offsetLeft + card.clientWidth / 2 - midpoint
      );
      const bestDistance = Math.abs(
        best.offsetLeft + best.clientWidth / 2 - midpoint
      );
      return currentDistance < bestDistance ? card : best;
    });
    const index = Number(closest.dataset.heroIndex);
    if (closest.dataset.heroClone) centerReal(index, true);
    selectIndex(index);
  };

  useEffect(() => {
    if (!count) return undefined;
    const frame = requestAnimationFrame(() => {
      selectIndex(0);
      centerReal(0, true);
    });
    return () => cancelAnimationFrame(frame);
  }, [count]);

  useEffect(() => {
    if (count < 2) return undefined;
    const timer = window.setInterval(goNext, 6000);
    return () => window.clearInterval(timer);
  }, [count]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    const onScroll = () => {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = window.setTimeout(settle, 130);
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(settleTimerRef.current);
      track.removeEventListener("scroll", onScroll);
    };
  }, [count]);

  useEffect(() => {
    const onKeyDown = event => {
      if (event.key === "ArrowLeft") goPrevious();
      if (event.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [count]);

  const onPointerDown = event => {
    if (event.pointerType === "touch") return;
    const track = trackRef.current;
    if (!track) return;
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startScrollLeft: track.scrollLeft,
    };
    track.setPointerCapture(event.pointerId);
    track.classList.add("hero-dragging");
  };

  const onPointerMove = event => {
    const track = trackRef.current;
    if (!dragRef.current.active || !track) return;
    track.scrollLeft =
      dragRef.current.startScrollLeft -
      (event.clientX - dragRef.current.startX);
  };

  const onPointerUp = event => {
    const track = trackRef.current;
    if (!dragRef.current.active || !track) return;
    dragRef.current.active = false;
    track.classList.remove("hero-dragging");
    if (track.hasPointerCapture(event.pointerId))
      track.releasePointerCapture(event.pointerId);
    settle();
  };

  const slides =
    count > 1
      ? [
          { item: items[count - 1], index: count - 1, clone: "tail" },
          ...items.map((item, index) => ({ item, index })),
          { item: items[0], index: 0, clone: "head" },
        ]
      : items.map((item, index) => ({ item, index }));

  if (isLoading)
    return (
      <header className="relative min-h-[320px] w-full overflow-hidden bg-black">
        <Shimmer />
      </header>
    );
  if (!count) return null;

  return (
    <header
      className="novel-hero relative w-full overflow-hidden bg-black py-1"
      aria-label="Novel pilihan"
    >
      <style>{`
        .novel-track { scrollbar-width: none; }
        .novel-track::-webkit-scrollbar { display: none; }
        .novel-track.hero-dragging { cursor: grabbing; scroll-snap-type: none; }
        .novel-card { container-type: inline-size; }
      `}</style>

      <button
        type="button"
        onClick={goPrevious}
        aria-label="Novel sebelumnya"
        className="absolute left-[max(12px,calc(50%-min(40vw,500px)))] top-1/2 z-30 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-black/75 text-white shadow-xl backdrop-blur-sm transition hover:scale-110 hover:border-[#F6CF80] hover:bg-[#F6CF80] hover:text-black active:scale-95 md:grid"
      >
        <Arrow direction="prev" />
      </button>

      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="novel-track flex snap-x snap-mandatory items-center overflow-x-auto overscroll-x-contain px-[6%] py-6 scroll-smooth md:px-[17%]"
        style={{ touchAction: "pan-x", cursor: "grab" }}
      >
        {slides.map(({ item, index, clone }, slidePosition) => {
          const isActive = !clone && index === activeIndex;
          const metrics = getMetrics(item);
          const tags = Array.isArray(item?.genres)
            ? item.genres.slice(0, 3)
            : item?.genre
              ? String(item.genre)
                  .split(",")
                  .map(tag => tag.trim())
                  .filter(Boolean)
                  .slice(0, 3)
              : [];
          const image = item?.banner || item?.cover;

          return (
            <article
              key={`${clone || "real"}-${index}-${slidePosition}`}
              data-hero-index={index}
              data-hero-clone={clone || undefined}
              aria-hidden={clone ? "true" : undefined}
              className={`novel-card relative -mx-2.5 aspect-[16/9] max-w-[860px] flex-[0_0_88%] snap-center overflow-hidden bg-[#0d0d10] shadow-[0_10px_30px_rgba(0,0,0,.5)] transition-all duration-[400ms] [transition-timing-function:cubic-bezier(.25,1,.5,1)] md:-mx-[15px] md:flex-[0_0_66%] ${isActive ? "z-20 scale-100 opacity-100 shadow-[0_18px_42px_rgba(0,0,0,.82)]" : "z-10 scale-[.88] opacity-45"}`}
            >
              {image && (
                <img
                  src={image}
                  className="absolute inset-0 h-full w-full object-cover"
                  draggable="false"
                  alt=""
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />

              <div className="relative z-10 flex h-full items-center">
                {item?.cover && (
                  <img
                    src={item.cover}
                    className="ml-[clamp(16px,5.5cqi,38px)] h-[70%] w-auto shrink-0 aspect-[9/16] rounded-md object-cover shadow-[4px_8px_20px_rgba(0,0,0,.65)]"
                    draggable="false"
                    alt={`Cover ${item?.title || "novel"}`}
                  />
                )}

                {metrics.length > 0 && (
                  <div className="absolute right-[clamp(12px,3cqi,26px)] top-[clamp(12px,3cqi,26px)] flex max-w-[48%] flex-wrap justify-end gap-1.5">
                    {metrics.map(metric => (
                      <span
                        key={metric.label}
                        className="rounded-md border border-white/15 bg-black/55 px-[1.4cqi] py-[.7cqi] text-[clamp(.46rem,1.3cqi,.68rem)] font-black text-white shadow-lg backdrop-blur-md"
                      >
                        <b className="text-[#F6CF80]">
                          {formatMetric(metric.value)}
                        </b>{" "}
                        <span className="text-white/70">{metric.label}</span>
                      </span>
                    ))}
                  </div>
                )}

                <div className="absolute bottom-[7%] left-[clamp(16px,5.5cqi,38px)] flex max-w-[75%] flex-wrap gap-1.5">
                  {tags.map(tag => (
                    <span
                      key={tag}
                      className="rounded-full border border-white/15 bg-black/45 px-[2cqi] py-[.55cqi] text-[clamp(.46rem,1.5cqi,.7rem)] font-black text-white shadow-md backdrop-blur-sm"
                    >
                      {tag}
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => navigate(`/novel/${item.id}`)}
                    tabIndex={clone ? -1 : 0}
                    className="rounded-full bg-[#F6CF80] px-[2cqi] py-[.55cqi] text-[clamp(.46rem,1.5cqi,.7rem)] font-black text-black shadow-md transition hover:bg-white"
                  >
                    Baca →
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <button
        type="button"
        onClick={goNext}
        aria-label="Novel berikutnya"
        className="absolute right-[max(12px,calc(50%-min(40vw,500px)))] top-1/2 z-30 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-black/75 text-white shadow-xl backdrop-blur-sm transition hover:scale-110 hover:border-[#F6CF80] hover:bg-[#F6CF80] hover:text-black active:scale-95 md:grid"
      >
        <Arrow direction="next" />
      </button>

      <div
        className="flex items-center justify-center gap-1.5 pb-2"
        aria-label="Pilih novel"
      >
        {items.map((item, index) => (
          <button
            key={item?.id || index}
            type="button"
            onClick={() => goTo(index)}
            aria-label={`Tampilkan novel ${index + 1}`}
            aria-current={activeIndex === index}
            className={`h-1.5 rounded-full transition-all ${activeIndex === index ? "w-6 bg-[#F6CF80] shadow-[0_0_10px_rgba(246,207,128,.65)]" : "w-1.5 bg-white/25"}`}
          />
        ))}
      </div>
    </header>
  );
}

const Home = () => {
  const navigate = useNavigate();
  const [latest, setLatest] = useState([]);
  const [novels, setNovels] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const latestRef = useRef(null);
  const novelRef = useRef(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    let alive = true;
    (async () => {
      setIsLoading(true);
      try {
        const [latestResult, novelResult] = await Promise.all([
          getLatest(1, 20),
          listNovels(1, 20),
        ]);
        if (!alive) return;
        setLatest(Array.isArray(latestResult) ? latestResult : []);
        setNovels(Array.isArray(novelResult) ? novelResult : []);
      } catch {
        if (alive) {
          setLatest([]);
          setNovels([]);
        }
      } finally {
        if (alive) setIsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const scroll = (ref, direction) =>
    ref.current?.scrollBy({
      left: direction === "left" ? -300 : 300,
      behavior: "smooth",
    });
  const heroNovels = [
    ...new Map(
      latest
        .filter(chapter => chapter?.novel)
        .map(chapter => [chapter.novel.id, chapter.novel])
    ).values(),
  ].slice(0, 6);

  return (
    <div className="min-h-screen bg-black pb-24 font-nunito text-white selection:bg-[#F6CF80] selection:text-black">
      <style>{`
        @keyframes shimmer { 0% { transform: translate3d(-100%,0,0) skewX(-20deg); } 100% { transform: translate3d(200%,0,0) skewX(-20deg); } }
        body, html { background-color: #000 !important; color: white; margin: 0; padding: 0; overscroll-behavior-y: none; }
        .custom-scrollbar::-webkit-scrollbar { height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 10px; }
      `}</style>

      <Navbar />
      <NovelHeroCarousel
        items={heroNovels}
        isLoading={isLoading}
        navigate={navigate}
      />

      <section className="mx-auto mt-10 max-w-7xl px-6">
        <div className="mb-4 flex items-center justify-between px-2">
          <div className="flex flex-col">
            <h2 className="text-lg font-black uppercase leading-none tracking-tight text-white">
              Update Terbaru
            </h2>
            <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/40">
              Chapter paling baru
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => scroll(latestRef, "left")}
              aria-label="Geser update ke kiri"
              className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 transition hover:bg-white/20"
            >
              <Arrow direction="prev" />
            </button>
            <button
              type="button"
              onClick={() => scroll(latestRef, "right")}
              aria-label="Geser update ke kanan"
              className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 transition hover:bg-white/20"
            >
              <Arrow direction="next" />
            </button>
          </div>
        </div>
        <div
          ref={latestRef}
          className="custom-scrollbar flex snap-x gap-3 overflow-x-auto px-2 pb-4"
        >
          {isLoading
            ? [...Array(10)].map((_, index) => <CardSkeleton key={index} />)
            : latest.map(chapter => (
                <div
                  key={chapter.id}
                  onClick={() => navigate(`/read/${chapter.id}`)}
                  className="group flex w-[105px] min-w-[105px] cursor-pointer snap-start flex-col gap-2 transition-transform active:scale-95"
                >
                  <div className="relative aspect-[3/4.5] overflow-hidden rounded-sm bg-[#16161a] shadow-xl">
                    {chapter.novel?.id && <NovCover catId={chapter.novel.id} />}
                    {chapter.premium && (
                      <span className="absolute right-1 top-1 rounded-sm bg-[#F6CF80] px-1 py-0.5 text-[7px] font-black text-black">
                        PREMIUM
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <h3 className="line-clamp-1 text-[9px] font-bold text-white/60 transition-colors group-hover:text-[#F6CF80]">
                      {chapter.novel?.title || chapter.title}
                    </h3>
                    <span className="line-clamp-1 text-[8px] font-bold text-white/30">
                      {chapter.title}
                    </span>
                  </div>
                </div>
              ))}
        </div>
      </section>

      <section className="mx-auto mt-10 max-w-7xl px-6">
        <div className="mb-4 flex items-center justify-between px-2">
          <div className="flex flex-col">
            <h2 className="text-lg font-black uppercase leading-none tracking-tight text-white">
              Semua Novel
            </h2>
            <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/40">
              Urut chapter terbanyak
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => scroll(novelRef, "left")}
              aria-label="Geser novel ke kiri"
              className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 transition hover:bg-white/20"
            >
              <Arrow direction="prev" />
            </button>
            <button
              type="button"
              onClick={() => scroll(novelRef, "right")}
              aria-label="Geser novel ke kanan"
              className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 transition hover:bg-white/20"
            >
              <Arrow direction="next" />
            </button>
          </div>
        </div>
        <div
          ref={novelRef}
          className="custom-scrollbar flex snap-x gap-3 overflow-x-auto px-2 pb-4"
        >
          {isLoading
            ? [...Array(10)].map((_, index) => <CardSkeleton key={index} />)
            : novels.map(novel => (
                <div
                  key={novel.id}
                  onClick={() => navigate(`/novel/${novel.id}`)}
                  className="group flex w-[105px] min-w-[105px] cursor-pointer snap-start flex-col gap-2 transition-transform active:scale-95"
                >
                  <div className="relative aspect-[3/4.5] overflow-hidden rounded-sm bg-[#16161a] shadow-xl">
                    <NovCover catId={novel.id} />
                    {toNumber(novel.count) !== null && (
                      <span className="absolute bottom-1 right-1 rounded-sm bg-black/60 px-1 py-0.5 text-[7px] font-black text-white/80">
                        {formatMetric(novel.count)} ch
                      </span>
                    )}
                  </div>
                  <h3 className="line-clamp-1 text-[9px] font-bold text-white/60 transition-colors group-hover:text-[#F6CF80]">
                    {novel.title}
                  </h3>
                </div>
              ))}
        </div>
      </section>

      <Footer />
    </div>
  );
};

const coverCache = {};
const NovCover = ({ catId }) => {
  const [src, setSrc] = useState(coverCache[catId] || null);
  useEffect(() => {
    if (coverCache[catId]) {
      setSrc(coverCache[catId]);
      return;
    }
    fetch(
      `/api/wp-json/wp/v2/posts?categories=${catId}&per_page=1&orderby=date&order=asc&_fields=content`
    )
      .then(response => response.json())
      .then(posts => {
        const html = posts?.[0]?.content?.rendered || "";
        const match = html.match(/src="([^"]+)"/);
        if (match) {
          const clean = match[1]
            .replace(/i\d?\.wp\.com\//, "")
            .split("?")[0]
            .replace("http://", "https://");
          coverCache[catId] = clean;
          setSrc(clean);
        }
      })
      .catch(() => {});
  }, [catId]);
  return src ? (
    <img
      src={src}
      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
      alt=""
    />
  ) : null;
};

export default Home;
