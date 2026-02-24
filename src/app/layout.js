import { Lato } from "next/font/google";
import AuthProvider from "@/components/AuthProvider";
import "./globals.css";

const lato = Lato({
  subsets: ["latin"],
  weight: ["100", "300", "400", "700", "900"], 
  variable: "--font-lato",
});

export const metadata = {
  title: "Zitadel Guest Auth Demo",
  description: "A demonstration of shadow accounts and cart merging.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      {/* 2. Apply Lato's className to the body */}
      <body className={`${lato.className} antialiased bg-gray-50`}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
