import "./obs.css";

export default function OBSLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="obs-root">
      {children}
    </div>
  );
}