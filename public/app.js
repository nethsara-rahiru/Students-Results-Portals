import { api, app, esc } from "./client.js";
import { StudentJourney } from "./journey.js";
try {
  const session = await api("/session");
  const journey = new StudentJourney(app, session);
  let student;
  try {
    student = JSON.parse(localStorage.getItem("levelup.student"));
  } catch {
    localStorage.removeItem("levelup.student");
  }
  if (student?._id && /^[a-f\d]{24}$/i.test(student._id))
    await journey.welcome(student);
} catch (error) {
  app.innerHTML = `<main class="center"><h1>We couldn’t connect.</h1><p role="alert">${esc(error.message)}</p><p>Please refresh the page to try again.</p></main>`;
}
