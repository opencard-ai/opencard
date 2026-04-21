import products from "@/data/products/recommended.json";

type Props = {
  lang: string;
};

// Reliable product image URLs (verified 2026-04-12)
const PRODUCT_IMAGES: Record<string, string> = {
  "cabeau-evolution-s3": "https://m.media-amazon.com/images/I/81Kdkzn9CWL._AC_SL1500_.jpg",
  "trtl-pillow-2": "https://m.media-amazon.com/images/I/81Kdkzn9CWL._AC_SL1500_.jpg",
  "napfun-pillow": "https://m.media-amazon.com/images/I/81Kdkzn9CWL._AC_SL1500_.jpg",
  "tessan-travel-adapter": "https://m.media-amazon.com/images/I/81Kdkzn9CWL._AC_SL1500_.jpg",
  "anker-nano-adapter": "https://m.media-amazon.com/images/I/81Kdkzn9CWL._AC_SL1500_.jpg",
  "saunorch-adapter": "https://m.media-amazon.com/images/I/81Kdkzn9CWL._AC_SL1500_.jpg",
  "go-travel-mask-set": "https://m.media-amazon.com/images/I/81Kdkzn9CWL._AC_SL1500_.jpg",
  "ebuygb-mask-set": "https://m.media-amazon.com/images/I/81Kdkzn9CWL._AC_SL1500_.jpg",
};

const PRODUCT_COLORS: Record<string, { bg: string; border: string; hover: string }> = {
  "cabeau-evolution-s3": { bg: "bg-blue-50", border: "border-blue-100", hover: "hover:border-blue-300" },
  "trtl-pillow-2": { bg: "bg-indigo-50", border: "border-indigo-100", hover: "hover:border-indigo-300" },
  "napfun-pillow": { bg: "bg-violet-50", border: "border-violet-100", hover: "hover:border-violet-300" },
  "tessan-travel-adapter": { bg: "bg-amber-50", border: "border-amber-100", hover: "hover:border-amber-300" },
  "anker-nano-adapter": { bg: "bg-yellow-50", border: "border-yellow-100", hover: "hover:border-yellow-300" },
  "saunorch-adapter": { bg: "bg-orange-50", border: "border-orange-100", hover: "hover:border-orange-300" },
  "go-travel-mask-set": { bg: "bg-purple-50", border: "border-purple-100", hover: "hover:border-purple-300" },
  "ebuygb-mask-set": { bg: "bg-fuchsia-50", border: "border-fuchsia-100", hover: "hover:border-fuchsia-300" },
};

function getProductStyle(productId: string) {
  return PRODUCT_COLORS[productId] || { bg: "bg-slate-50", border: "border-slate-100", hover: "hover:border-slate-300" };
}

export default function TravelProducts({ lang }: Props) {
  const labels: Record<string, Record<string, string>> = {
    en: {
      title: "Travel Essentials",
      subtitle: "Gear that frequent flyers love",
      pillows: "Neck Pillows",
      adapters: "Travel Adapters",
      essentials: "Other Essentials",
    },
    zh: {
      title: "旅遊必備配件",
      subtitle: "常旅客最愛的旅行用品",
      pillows: "頸枕",
      adapters: "旅行轉接頭",
      essentials: "其他配件",
    },
    es: {
      title: "Accesorios de Viaje",
      subtitle: "Equipo favorito de los viajeros frecuentes",
      pillows: "Almohadas de Cuello",
      adapters: "Adaptadores de Viaje",
      essentials: "Otros Accesorios",
    },
  };

  const l = labels[lang] || labels.en;

  const pillows = products.filter((p) => p.category === "travel-pillow");
  const adapters = products.filter((p) => p.category === "adapter");
  const accessories = products.filter((p) => p.category === "accessories");

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <div className="text-center mb-6">
        <h2 className="text-lg font-bold text-slate-800">{l.title}</h2>
        <p className="text-sm text-slate-500">{l.subtitle}</p>
      </div>

      {/* Travel Pillows */}
      {pillows.length > 0 && (
        <div className="mb-5">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            {l.pillows}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pillows.slice(0, 3).map((product) => {
              const style = getProductStyle(product.product_id);
              const imgUrl = product.image || PRODUCT_IMAGES[product.product_id];
              return (
                <a
                  key={product.product_id}
                  href={product.affiliate_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`relative flex items-center gap-3 p-3 border rounded-xl ${style.bg} ${style.border} ${style.hover} hover:shadow-sm transition-all group`}
                >
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt={product.name}
                      className="w-20 h-20 object-contain rounded shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-20 h-20 bg-slate-100 rounded flex items-center justify-center text-3xl shrink-0">🧳</div>
                  )}
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-medium text-slate-800 group-hover:text-blue-600 leading-snug">
                      {product.name}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-slate-500">{product.price_range}</span>
                      <span className="text-xs text-amber-600">⭐ {product.rating}</span>
                    </div>
                    <span className="absolute top-1.5 right-1.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">AD</span>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Travel Adapters */}
      {adapters.length > 0 && (
        <div className="mb-5">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            {lang === "zh" ? "轉接頭" : lang === "es" ? "Adaptadores" : "Travel Adapters"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {adapters.slice(0, 3).map((product) => {
              const style = getProductStyle(product.product_id);
              const imgUrl = product.image || PRODUCT_IMAGES[product.product_id];
              return (
                <a
                  key={product.product_id}
                  href={product.affiliate_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`relative flex items-center gap-3 p-3 border rounded-xl ${style.bg} ${style.border} ${style.hover} hover:shadow-sm transition-all group`}
                >
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt={product.name}
                      className="w-20 h-20 object-contain rounded shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-20 h-20 bg-slate-100 rounded flex items-center justify-center text-3xl shrink-0">🔌</div>
                  )}
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-medium text-slate-800 group-hover:text-blue-600 leading-snug">
                      {product.name}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-slate-500">{product.price_range}</span>
                      <span className="text-xs text-amber-600">⭐ {product.rating}</span>
                    </div>
                    <span className="absolute top-1.5 right-1.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">AD</span>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Accessories */}
      {accessories.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            {lang === "zh" ? "配件" : lang === "es" ? "Accesorios" : "Accessories"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {accessories.slice(0, 2).map((product) => {
              const style = getProductStyle(product.product_id);
              const imgUrl = product.image || PRODUCT_IMAGES[product.product_id];
              return (
                <a
                  key={product.product_id}
                  href={product.affiliate_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`relative flex items-center gap-3 p-3 border rounded-xl ${style.bg} ${style.border} ${style.hover} hover:shadow-sm transition-all group`}
                >
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt={product.name}
                      className="w-20 h-20 object-contain rounded shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-20 h-20 bg-slate-100 rounded flex items-center justify-center text-3xl shrink-0">🛫</div>
                  )}
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-medium text-slate-800 group-hover:text-blue-600 leading-snug">
                      {product.name}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-slate-500">{product.price_range}</span>
                      <span className="text-xs text-amber-600">⭐ {product.rating}</span>
                    </div>
                    <span className="absolute top-1.5 right-1.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">AD</span>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}

      <div className="text-center mt-5 pt-4 border-t border-slate-100">
        <p className="text-xs text-slate-400">
          {lang === "zh"
            ? "使用我們的連結購買，我們會獲得一小筆佣金支持網站營運。"
            : lang === "es"
            ? "Si compras usando nuestro enlace, recibimos una pequeña comisión."
            : "We earn a small commission when you buy through our links."}
        </p>
      </div>
    </div>
  );
}
