"use client";

interface BackToSectionProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

export default function BackToSection({ href, children, className = "" }: BackToSectionProps) {
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
