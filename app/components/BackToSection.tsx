"use client";

import { useRouter } from "next/navigation";

interface BackToSectionProps {
  href: string; // e.g. "/en#cards-section"
  children: React.ReactNode;
  className?: string;
}

export default function BackToSection({ href, children, className = "" }: BackToSectionProps) {
  const router = useRouter();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    router.push(href);
  };

  return (
    <a href={href} onClick={handleClick} className={className}>
      {children}
    </a>
  );
}
