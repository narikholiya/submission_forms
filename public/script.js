
const result = document.getElementById("result");

async function handleForm(form, endpoint, multipart = false) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    result.textContent = "Submitting...";

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: multipart ? {} : {
          "Content-Type": "application/json"
        },
        body: multipart
          ? new FormData(form)
          : JSON.stringify(Object.fromEntries(new FormData(form)))
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.message);

      result.textContent = data.message;
      form.reset();

    } catch (error) {
      result.textContent = error.message || "Something went wrong";
    } finally {
      button.disabled = false;
    }
  });
}

handleForm(
  document.getElementById("submissionForm"),
  "/api/submissions"
);

handleForm(
  document.getElementById("careerForm"),
  "/api/careers",
  true
);
