addEventListener('fetch', event => {
	const { request } = event;

	switch (request.method) {
		case 'POST':
			return event.respondWith(handlePOST(request));
		case 'DELETE':
			return event.respondWith(handleDELETE(request));
		default:
			return event.respondWith(handleRequest(request, event));
	}
});

const html = `<!DOCTYPE html>
<body>
    <pre>
    use an actual path if you're trying to fetch something.
    send a POST request with form data "url" and "path" if you're trying to put something.
    set x-preshared-key header for authentication.
    
    source: <a href="https://github.com/VandyHacks/vhl.ink">VandyHacks/vhl.ink</a>
    </pre>
</body>`;

/**
 * Respond to POST requests with shortened URL creation
 * @param {Request} request
 */
async function handlePOST(request) {
	const psk = request.headers.get('x-preshared-key');
	if (psk !== SECRET_KEY)
		return new Response('Sorry, bad key.', { status: 403 });

	const shortener = new URL(request.url);
	const data = await request.formData();
	const redirectURL = data.get('url');
	let path = data.get('path');

	if (!redirectURL) return new Response('`url` needs to be set.', { status: 400 });

	try {
		new URL(redirectURL);
	} catch (e) {
		if (e instanceof TypeError) 
			return new Response('`url` needs to be a valid http url.', { status: 400 });
		else throw e;
	};

	const generateRandomId = () => {
		const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		let result = '';
		for (let i = 0; i < 16; i++) {
			result += characters.charAt(Math.floor(Math.random() * characters.length));
		}
		return result;
	};

	if (!path) {
		let unique = false;
		while (!unique) {
			path = generateRandomId();
			const existing = await LINKS.get(path);
			if (!existing) {
				unique = true;
			}
		}
	}

	await LINKS.put(path, redirectURL);
	return new Response(`${redirectURL} available at ${shortener}${path}`, {
		status: 201,
	});
}

/**
 * Respond to DELETE requests by deleting the shortlink
 * @param {Request} request
 */
async function handleDELETE(request) {
	const psk = request.headers.get('x-preshared-key');
	if (psk !== SECRET_KEY)
		return new Response('Sorry, bad key.', { status: 403 });

	const url = new URL(request.url);
	const path = url.pathname.split('/')[1];
	if (!path) return new Response('Not found', { status: 404 });
	await LINKS.delete(path);
	return new Response(`${request.url} deleted!`, { status: 200 });
}

/**
 * Respond to GET requests with redirects.
 *
 * Authenticated GET requests without a path will return a list of all
 * shortlinks registered with the service.
 * @param {Request} request
 */
async function handleRequest(request, event) {
	const url = new URL(request.url);
	const path = url.pathname.split('/')[1];
	if (!path) {
		const psk = request.headers.get('x-preshared-key');
		if (psk === SECRET_KEY) {
			const { keys } = await LINKS.list();
			const dataPromises = keys.map(async (element) => {
				const value = await LINKS.get(element.name);
				return { name: element.name, value };
			})
			const dataArray = await Promise.all(dataPromises);
            return new Response(JSON.stringify(dataArray), { status: 200 });
		} else {
			return new Response(html, {
				headers: {
					'content-type': 'text/html;charset=UTF-8',
				},
			});
		}
	}

	const redirectURL = await LINKS.get(path);
	if (redirectURL) {
		return Response.redirect(redirectURL, 302);
	}

	return new Response('URL not found. Sad!', { status: 404 });
}
