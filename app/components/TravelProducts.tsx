import products from "@/data/products/recommended.json";

type Props = {
  lang: string;
};

// 產品圖片映射
const productImages: Record<string, string> = {
  "cabeau-evolution-s3": "https://m.media-amazon.com/images/I/81XqKkDboML._AC_SL300_.jpg",
  "trtl-pillow-2": "https://m.media-amazon.com/images/I/71XrqFqDqgL._AC_SL300_.jpg",
  "tessan-travel-adapter": "https://m.media-amazon.com/images/I/71xkqLxGYjL._AC_SL300_.jpg",
  "anker-nano-adapter": "https://m.media-amazon.com/images/I/71qkLxGYjL._AC_SL300_.jpg",
  "go-travel-mask-set": "https://m.media-amazon.com/images/I/61XQKrFDqgL._AC_SL300_.jpg",
  "napfun-pillow": "https://m.media-amazon.com/images/I/61AbIyEnL._AC_SL300_.jpg",
  "saunorch-adapter": "https://m.media-amazon.com/images/I/61DEF123456._AC_SL300_.jpg",
  "ebuygb-mask-set": "https://m.media-amazon.com/images/I/61DEF123456._AC_SL300_.jpg",
};

export default function TravelProducts({ lang }: Props) {
  const labels: Record<string, Record<string, string>> = {
    en: {
      title: "Travel Essentials",
      subtitle: "Gear that frequent flyers love",
      viewAll: "View on Amazon →",
    },
    zh: {
      title: "旅遊必備配件",
      subtitle: "常旅客最愛的旅行用品",
      viewAll: "查看更多 →",
    },
    es: {
      title: "Accesorios de Viaje",
      subtitle: "Equipo favorito de los viajeros frecuentes",
      viewAll: "Ver en Amazon →",
    },
  };

  const l = labels[lang] || labels.en;

  // Group products by category
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
            {lang === "zh" ? "頸枕" : lang === "es" ? "Almohadas de Cuello" : "Neck Pillows"}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {pillows.slice(0, 3).map((product) => (
              <a
                key={product.product_id}
                href={product.affiliate_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-3 border border-slate-100 rounded-lg hover:border-yellow-300 hover:shadow-sm transition-all group"
              >
                {productImages[product.product_id] && (
                  <div className="flex justify-center mb-2">
                    <img 
                      src={productImages[product.product_id]} 
                      alt={product.name}
                      className="h-16 w-auto object-contain"
                    />
                  </div>
                )}
                <div className="text-sm font-medium text-slate-800 group-hover:text-blue-600 line-clamp-2">
                  {product.name}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-slate-500">{product.price_range}</span>
                  <span className="text-xs text-amber-600">⭐ {product.rating}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Travel Adapters */}
      {adapters.length > 0 && (
        <div className="mb-5">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            {lang === "zh" ? "轉接頭" : lang === "es" ? "Adaptadores" : "Travel Adapters"}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {adapters.slice(0, 3).map((product) => (
              <a
                key={product.product_id}
                href={product.affiliate_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-3 border border-slate-100 rounded-lg hover:border-yellow-300 hover:shadow-sm transition-all group"
              >
                {productImages[product.product_id] && (
                  <div className="flex justify-center mb-2">
                    <img 
                      src={productImages[product.product_id]} 
                      alt={product.name}
                      className="h-16 w-auto object-contain"
                    />
                  </div>
                )}
                <div className="text-sm font-medium text-slate-800 group-hover:text-blue-600 line-clamp-2">
                  {product.name}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-slate-500">{product.price_range}</span>
                  <span className="text-xs text-amber-600">⭐ {product.rating}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Accessories */}
      {accessories.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            {lang === "zh" ? "配件" : lang === "es" ? "Accesorios" : "Accessories"}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {accessories.slice(0, 2).map((product) => (
              <a
                key={product.product_id}
                href={product.affiliate_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-3 border border-slate-100 rounded-lg hover:border-yellow-300 hover:shadow-sm transition-all group"
              >
                {productImages[product.product_id] && (
                  <div className="flex justify-center mb-2">
                    <img 
                      src={productImages[product.product_id]} 
                      alt={product.name}
                      className="h-16 w-auto object-contain"
                    />
                  </div>
                )}
                <div className="text-sm font-medium text-slate-800 group-hover:text-blue-600 line-clamp-2">
                  {product.name}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-slate-500">{product.price_range}</span>
                  <span className="text-xs text-amber-600">⭐ {product.rating}</span>
                </div>
              </a>
            ))}
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