"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession, signOut, signIn } from "next-auth/react";
import Image from "next/image";

function decodeJWT(token) {
  if (!token) return null;
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window.atob(base64).split('').map((c) => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return { error: "Failed to decode token", details: e.message };
  }
}

const PRODUCTS = [
  { id: 1, name: "Cool Sneakers", price: 120 },
  { id: 2, name: "Vintage T-Shirt", price: 35 },
  { id: 3, name: "Mechanical Keyboard", price: 150 },
];

export default function HomePage() {
  const { data: session, status } = useSession();
  const [cart, setCart] = useState([]);
  const [guestToken, setGuestToken] = useState(null);
  const [isAdding, setIsAdding] = useState(false);

  const activeToken = session?.idToken || guestToken;
  const decodedIdToken = activeToken ? decodeJWT(activeToken) : null;

  // 1. PAGE LOAD: Just fetch the cart. No automatic guest creation!
  useEffect(() => {
    if (status === "loading") return;

    const fetchCart = async () => {
      const res = await fetch("/api/cart");
      if (res.ok) {
        const data = await res.json();
        setCart(data.cart);
        setGuestToken(data.idToken); // Will be null if no guest/user session exists yet
      }
    };

    fetchCart();
  }, [status]);

  // 2. USER INTENT: Create guest ONLY when they click "Add to Cart"
  const addToCart = async (product) => {
    setIsAdding(true);

    // Check if we need to create a guest account first
    if (status === "unauthenticated" && !guestToken) {
      const initRes = await fetch("/api/init-guest", { method: "POST" });
      if (!initRes.ok) {
        console.error("Failed to initialize guest session");
        setIsAdding(false);
        return; // Abort if we couldn't create the guest
      }
      // If successful, the httpOnly cookie is now set!
    }

    // Now proceed with adding the item to the cart
    const res = await fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(product),
    });

    if (res.ok) {
      const data = await res.json();
      setCart(data.cart);
      setGuestToken(data.idToken); // This will sync the newly created token to the UI
    }

    setIsAdding(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* NAVBAR */}
      <nav className="bg-white shadow-sm p-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Image
            src="/assets/logo.svg" 
            alt="Demo App Logo"
            width={0}
            height={40}
            style={{ width: "auto", height: "40px" }}
            priority
          />
          <h1 className="text-xl font-bold">Guest Accounts Demo App</h1>
        </div>

        {/* RIGHT SIDE: Cart and Auth Buttons */}
        <div className="flex items-center gap-6">
          <div className="font-semibold text-gray-700">
            Cart: {cart.length} item{cart.length !== 1 && "s"}
          </div>

          {status === "authenticated" ? (
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition"
            >
              Sign Out
            </button>
          ) : (
            <div className="flex items-center gap-4">
              <button
                onClick={() => signIn("zitadel")}
                className="text-blue-600 font-medium hover:text-blue-800 transition"
              >
                Sign In
              </button>
              <Link
                href="/register"
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                Register / Checkout
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* PRODUCT GRID */}
      <main className="max-w-4xl mx-auto p-8">
        <h2 className="text-2xl font-bold mb-6">Latest Products</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PRODUCTS.map((product) => (
            <div key={product.id} className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-semibold">{product.name}</h3>
                <p className="text-gray-600 mb-4">${product.price}</p>
              </div>
              <button
                onClick={() => addToCart(product)}
                disabled={isAdding}
                className="w-full bg-gray-900 text-white py-2 rounded hover:bg-gray-800 disabled:opacity-50 transition"
              >
                Add to Cart
              </button>
            </div>
          ))}
        </div>

        {/* DEBUG WINDOWS */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">

          <div className="p-4 bg-gray-200 rounded text-sm font-mono overflow-auto h-96">
            <p className="font-bold mb-2">Debug - Local Cart Data:</p>
            <pre>{JSON.stringify(cart, null, 2)}</pre>
          </div>

          <div className="p-4 bg-slate-800 text-green-400 rounded text-sm font-mono overflow-auto h-[32rem]">
            <p className="font-bold mb-2 text-white">
              Debug - Decoded ID Token ({status === "authenticated" ? "NextAuth" : "Guest Impersonation"}):
            </p>
            {decodedIdToken ? (
              <pre>{JSON.stringify(decodedIdToken, null, 2)}</pre>
            ) : (
              <p className="text-gray-400">Waiting for user interaction...</p>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}