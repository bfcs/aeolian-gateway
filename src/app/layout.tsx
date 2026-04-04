import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className={cn("font-sans")}>
			<body className="antialiased font-sans">
				<ToastProvider>{children}</ToastProvider>
			</body>
		</html>
	);
}
