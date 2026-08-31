import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { Outlet } from "react-router-dom";
import { AenderungswunschKnopf } from "@/components/aenderungswunsch/AenderungswunschKnopf";

export function AppLayout() {
  const isMobile = useIsMobile();

  // Der schwebende Melde-Knopf fängt die Seiten ab, die ihre Kopfzeile selbst
  // bauen. Er blendet sich aus, sobald ein [data-seitenkopf] auf der Seite
  // steht — dort sitzt der Knopf ja schon in der Leiste.

  // Mobile: no sidebar, render pages directly as before
  if (isMobile) {
    return (
      <>
        <Outlet />
        <AenderungswunschKnopf gestalt="schwebend" />
      </>
    );
  }

  // Desktop: sidebar + content area
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Outlet />
        <AenderungswunschKnopf gestalt="schwebend" />
      </SidebarInset>
    </SidebarProvider>
  );
}
