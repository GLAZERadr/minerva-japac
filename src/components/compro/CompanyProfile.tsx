import React from "react";
import Head from "next/head";
import { Phone, Mail, MapPin, Menu, X } from "lucide-react";
import Lanyard from "@/components/Lanyard";

export default function CompanyProfile() {
  // State untuk mobile menu jika diperlukan, namun untuk saat ini kita buat statis sesuai struktur html
  // atau menggunakan simple toggle jika ingin interaktif.
  // Mengikuti gaya statis 'page.tsx' sebelumnya, kita gunakan structure HTML yang di-convert ke JSX.

  return (
    <div className="min-h-screen h-screen overflow-y-auto bg-[#0c1220] text-white font-sans selection:bg-blue-500 selection:text-white overflow-x-hidden">
      <Head>
        <title>Minerva Profile</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      {/* --- NAVBAR --- 
          Source: index.html (structure)
      */}
      <nav className="fixed top-0 left-0 w-full z-50 backdrop-blur bg-[#0c1220]/90 border-b border-white/10 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 py-6 flex justify-between items-center">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <img src="/minerva-logo.png" alt="Minerva Logo" className="w-20" />
          </div>

          {/* Nav Links - Desktop */}
          <div className="hidden md:flex gap-8 text-sm font-medium">
            <a
              href="#home"
              className="nav-link hover:text-blue-400 transition-colors"
            >
              Home
            </a>
            <a
              href="#product"
              className="nav-link hover:text-blue-400 transition-colors"
            >
              Product
            </a>
            <a
              href="#portfolio"
              className="nav-link hover:text-blue-400 transition-colors"
            >
              Portfolio
            </a>
            <a
              href="#about"
              className="nav-link hover:text-blue-400 transition-colors"
            >
              About Us
            </a>
          </div>

          {/* Language + Hamburger */}
          <div className="flex items-center gap-4 relative">
            {/* Language Button (Static representation based on index.html) */}
            <button id="langBtn" className="flex items-center gap-2">
              <img
                id="langFlag"
                src="https://flagcdn.com/w20/id.png"
                alt="IND"
                className="w-6 h-4"
              />
            </button>

            {/* Mobile Menu Button */}
            <button className="md:hidden text-white text-2xl">
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>
      </nav>

      {/* --- HERO SECTION --- 
          Source: index.html (Video background, Text, Contact Button)
      */}
      <section
        id="home"
        className="relative h-screen w-full flex items-center justify-center text-center overflow-hidden"
      >
        {/* Background Video */}
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-40"
        >
          <source src="/videos/video-dashboard.mp4" type="video/mp4" />
        </video>

        {/* Gradient Overlays */}
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-[#0c1220] to-transparent pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-[#0c1220] to-transparent pointer-events-none"></div>

        <div className="relative z-10 max-w-2xl px-6 pt-20">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Digital Twin</h1>
          <p className="text-gray-300 mb-6 text-lg">
            Real-Time Digital Twin AI Optimization for{" "}
            <br className="hidden md:block" />
            Sustainable Manufacturing
          </p>
          <a
            href="https://wa.me/6282217257007?text=Halo%20tim%20MINERVA,%0A%0ASaya%20ingin%20bertanya%20atau%20berdiskusi%20lebih%20lanjut%20terkait%20proyek%20MINERVA.%20Apakah%20bisa%20dijadwalkan%20meeting%20atau%20diberikan%20informasi%20lebih%20lanjut%3F%0A%0ATerima%20kasih."
            target="_blank"
            rel="noopener noreferrer"
            className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg text-white font-medium inline-block transition-colors"
          >
            Contact Now
          </a>
        </div>
      </section>

      {/* --- PRODUCT SECTION --- 
          Source: index.html (Layout, Icons as Images, Titles)
      */}
      <section id="product" className="relative py-24 bg-[#0c1220] text-white">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-semibold mb-12 text-center">Product</h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Card 1 */}
            <div className="bg-[#10192e] p-6 rounded-xl shadow-lg hover:scale-105 transition transform duration-300">
              <img
                src="/images/icon1.png"
                alt="Dashboard"
                className="w-24 mb-4"
              />
              <h3 className="font-semibold text-lg mb-2">
                Interactive Digital Twin Dashboard
              </h3>
              <p className="text-gray-300 text-sm">
                Live 3D twin of the whole smelter line, with every machine's status, health score and sensor readings in one view.
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-[#10192e] p-6 rounded-xl shadow-lg hover:scale-105 transition transform duration-300">
              <img
                src="/images/icon2.png"
                alt="Optimization"
                className="w-24 mb-4"
              />
              <h3 className="font-semibold text-lg mb-2">
                AI Energy Optimization & Simulation
              </h3>
              <p className="text-gray-300 text-sm">
                Test furnace, casting and cooling settings before touching the line, and see the energy, yield and CO₂ impact up front.
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-[#10192e] p-6 rounded-xl shadow-lg hover:scale-105 transition transform duration-300">
              <img
                src="/images/icon3.png"
                alt="Analysis"
                className="w-24 mb-4"
              />
              <h3 className="font-semibold text-lg mb-2">
                Predictive & Prescriptive Analysis
              </h3>
              <p className="text-gray-300 text-sm">
                Spot failing parts weeks before they stop the line, with a plain-language explanation of what happened, why, and what to do next.
              </p>
            </div>

            {/* Card 4 */}
            <div className="bg-[#10192e] p-6 rounded-xl shadow-lg hover:scale-105 transition transform duration-300">
              <img
                src="/images/icon4.png"
                alt="AI Agent"
                className="w-24 mb-4"
              />
              <h3 className="font-semibold text-lg mb-2">
                Ask AI Agent for Quick Insight
              </h3>
              <p className="text-gray-300 text-sm">
                Ask questions in plain language and get answers built from live plant data, such as "which machines need attention right now?".
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* --- TRANSITION VIDEO SECTION --- 
          Source: index.html
      */}
      <section className="relative h-[80vh] w-full overflow-hidden">
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-60"
        >
          <source src="/videos/video-2.mp4" type="video/mp4" />
        </video>
        <div className="absolute top-0 left-0 w-full h-40 bg-gradient-to-b from-[#0c1220] to-transparent"></div>
        <div className="absolute bottom-0 left-0 w-full h-40 bg-gradient-to-t from-[#0c1220] to-transparent"></div>
      </section>

      {/* --- PORTFOLIO SECTION --- 
          Source: index.html (Structure, Image, Text content)
      */}
      <section
        id="portfolio"
        className="relative"
        style={{ marginTop: "-200px" }}
      >
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-semibold mb-12 relative z-10">
            Portfolio
          </h2>

          <div className="bg-[#10192e] rounded-xl p-6 md:p-10 grid grid-cols-1 md:grid-cols-2 gap-8 shadow-xl relative z-10">
            <img
              src="/hackathon-winner.JPG"
              alt="Hackathon Winner"
              className="rounded-lg shadow-lg w-full h-auto object-cover"
            />

            <div className="text-left flex flex-col justify-between">
              <div>
                <h3 className="text-xl font-semibold mb-4">
                  1st Winner Hackathon
                </h3>
                <p className="text-gray-300 text-sm leading-relaxed text-[16px]">
                  MINERVA won 1st place in the 2025 Hackathon organized by
                  Ericsson, Qualcomm, Komdigi, and the Ministry of Industry with
                  a focus on 5G and AI technology. The Future of Tech team won
                  the competition through its AI-Powered Optimization Digital
                  Twin solution. MINERVA is able to address industrial
                  challenges such as high operational costs, manual processes,
                  monitoring delays, and energy waste. With a real-time Digital
                  Twin, predictive AI, and smart energy intelligence, MINERVA
                  delivers more efficient, intelligent, and sustainable
                  operations.
                </p>
              </div>

              <a
                href="#"
                className="mt-6 bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg text-white font-medium w-fit transition-colors"
              >
                See More
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
        ABOUT US SECTION (PRESERVED FROM ORIGINAL PAGE.TSX AS REQUESTED)
        ================================================================
      */}
      <section id="about" className="py-24 bg-[#0F141F] mt-24">
        <div className="container mx-auto px-6">
          <h2 className="text-4xl font-bold mb-16 text-center">About Us</h2>
          {/* Visi & Misi Grid */}
          <div className="grid md:grid-cols-2 gap-12 lg:gap-20 mb-20">
            {/* Visi Column */}
            <div>
              <h3 className="text-2xl font-bold text-blue-500 mb-6 uppercase tracking-wider">
                Vision
              </h3>
              <div className="text-gray-400 leading-relaxed space-y-4 text-sm md:text-base">
                <p>
                  Every factory in Indonesia runs efficient, low-carbon and
                  self-optimizing operations, guided by a living digital twin of
                  its production line.
                </p>
                <p>
                  We want industrial intelligence to be as accessible to a
                  regional smelter as it is to a global manufacturer.
                </p>
              </div>
            </div>

            {/* Misi Column */}
            <div>
              <h3 className="text-2xl font-bold text-blue-500 mb-6 uppercase tracking-wider">
                Mission
              </h3>
              <ul className="text-gray-400 leading-relaxed space-y-3 text-sm md:text-base list-disc pl-5">
                <li>
                  Connect machines, sensors and production records into one
                  real-time view of the plant.
                </li>
                <li>
                  Use AI to cut energy waste and predict failures before they
                  stop production.
                </li>
                <li>
                  Let operators test changes in simulation first, so every
                  improvement is safe and measurable.
                </li>
                <li>
                  Make plant data easy to question in everyday language.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className=" bg-[#0B0F17] w-full h-full">
        {/* Team Lanyards - render 4 lanyards for each team member */}
        <div className=" grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          <div>
            <Lanyard
              image="/band.png"
              model="/3d-model/adrian.glb"
              heightClass="h-[85vh] md:h-[90vh]"
            />
          </div>
          <div>
            <Lanyard
              image="/band.png"
              model="/3d-model/dhafin.glb"
              heightClass="h-[85vh] md:h-[90vh]"
            />
          </div>
          <div>
            <Lanyard
              image="/band.png"
              model="/3d-model/resan.glb"
              heightClass="h-[85vh] md:h-[90vh]"
            />
          </div>
          <div>
            <Lanyard
              image="/band.png"
              model="/3d-model/rafi.glb"
              heightClass="h-[85vh] md:h-[90vh]"
            />
          </div>
        </div>
      </section>

      {/* --- FOOTER --- 
          Source: index.html (Layout, "Try Our Product" section, Contact info)
      */}
      <footer
        id="contact"
        className="bg-[#151b29] pt-10 pb-5 text-white border-t border-gray-800"
      >
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-10">
          {/* Logo + Deskripsi + Try Product */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <img src="/minerva-logo.png" alt="Minerva" className="w-40" />
            </div>

            <p className="text-gray-300 text-sm leading-relaxed mb-5 mt-10">
              Real-Time Digital Twin AI Optimization for
              <br />
              Sustainable Manufacturing
            </p>

            <a
              href="https://minerva-ericsson.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <button className="bg-blue-600 hover:bg-blue-700 text-white mt-10 px-4 py-2 rounded-md text-sm transition-colors">
                Try Our Product
              </button>
            </a>
          </div>

          {/* Garis Vertikal (Hidden on Mobile) */}
          <div className="hidden md:flex justify-center">
            <div className="border-l border-gray-600 h-full opacity-70"></div>
          </div>

          {/* Menu + Contact */}
          <div className="grid grid-cols-2 gap-4">
            {/* Menu */}
            <div>
              <h4 className="font-semibold mb-4">Event Links</h4>
              <ul className="space-y-2 text-gray-300 text-sm">
                <li>
                  <a href="#home" className="hover:text-blue-400 transition">
                    Home
                  </a>
                </li>
                <li>
                  <a href="#product" className="hover:text-blue-400 transition">
                    Product
                  </a>
                </li>
                <li>
                  <a
                    href="#portfolio"
                    className="hover:text-blue-400 transition"
                  >
                    Portfolio
                  </a>
                </li>
                <li>
                  <a href="#about" className="hover:text-blue-400 transition">
                    About Us
                  </a>
                </li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="font-semibold mb-4">Contact</h4>
              <ul className="space-y-4 text-gray-300 text-sm">
                <li className="flex items-center gap-2">
                  +62 822-1725-7007 (dhafin)
                </li>
                <li className="flex items-center gap-2">minerva@gmail.com</li>
                <li className="flex items-start gap-2">
                  <span>
                    Bandung, Jawa Barat,
                    <br />
                    Indonesia
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="text-center text-gray-400 text-xs mt-10 border-t border-gray-700 pt-4">
          © Develop by MINERVA Team. 2025
        </div>
      </footer>
    </div>
  );
}
