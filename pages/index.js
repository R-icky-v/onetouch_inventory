// Ubicación CORRECTA:
// -> Pages Router: /pages/index.js
// -> App Router: /app/page.js

// Componente funcional con export default
export default function HomePage() {
  return (
    <div className="bg-white p-8">
      <h1 className="text-3xl font-bold text-blue-600">
        ¡Hola Mundo Next.js 16!
      </h1>
    </div>
  );
}
