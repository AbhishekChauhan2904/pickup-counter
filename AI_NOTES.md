# AI notes

## Tools used
- **Copilot SDK in VS Code:** I used it in a later review-and-fix session to inspect the order, payment and pickup flows, align the late-payment policy, and run the backend tests and TypeScript/build checks.

## A prompt that worked well
For the review-and-fix session, I asked for a review of the project against the assignment, then asked to fix three specific findings: complete these notes truthfully, make the late-payment policy and customer screen agree, and review dependency advisories. Providing the concrete findings kept the changes focused and testable.

## Something the AI got wrong
The initial Copilot review noticed that the screen stopped polling after 30 seconds, but did not initially identify that the backend would accept late captures indefinitely. Comparing the webhook state transition with the screen's polling window exposed that mismatch. I added a server-enforced 30-second cutoff and made the screen use the remaining time returned by the server.

## What was checked in this session
The backend PostgreSQL integration tests, backend and frontend TypeScript checks, and frontend production build were run.the customer UI or independently run the Docker Compose workflow in this session.
