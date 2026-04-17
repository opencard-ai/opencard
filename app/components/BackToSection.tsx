"use client";

interface BackToSectionProps {
  href: string; // e.g. "/en#cards-section"
  children: React.ReactNode;
  className?: string;
}

export default function BackToSection({ href, children, className = "" }: BackToSectionProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    window.location.href = href;
  };

  return (
    <a href={href} onClick={handleClick} className={className}>
      {children}
    </a>
  );
}
