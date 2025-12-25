"use client";

export function WelcomeMessage() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <h2 className="text-2xl font-semibold mb-3">
        Welcome to the Builder Chat
      </h2>
      <p className="text-muted-foreground mb-8 max-w-md text-base">
        Describe the website you want to build and I'll help you create it.
      </p>
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground font-medium">Try examples like:</p>
        <ul className="flex flex-col gap-2 text-left max-w-md">
          <li className="flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5">•</span>
            <span className="text-foreground">
              Create a landing page for a coffee shop
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5">•</span>
            <span className="text-foreground">Build a portfolio website</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5">•</span>
            <span className="text-foreground">
              Make a blog with a dark theme
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
