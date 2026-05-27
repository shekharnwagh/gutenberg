/**
 * External dependencies
 */
import type { Page } from '@playwright/test';

/**
 * Internal dependencies
 */
import { test, expect } from './fixtures';
import { SECOND_USER } from './fixtures/collaboration-utils';
import type CollaborationUtils from './fixtures/collaboration-utils';

async function openDuplicateEditorPage( {
	collaborationUtils,
	page,
	postId,
}: {
	collaborationUtils: CollaborationUtils;
	page: Page;
	postId: number;
} ) {
	const duplicatePage = await page.context().newPage();
	await duplicatePage.goto(
		`/wp-admin/post.php?post=${ postId }&action=edit`
	);
	await duplicatePage.waitForFunction(
		() => window?.wp?.data && window?.wp?.blocks
	);
	await duplicatePage.evaluate( () => {
		window.wp.data
			.dispatch( 'core/preferences' )
			.set( 'core/edit-post', 'welcomeGuide', false );
		window.wp.data
			.dispatch( 'core/preferences' )
			.set( 'core/edit-post', 'fullscreenMode', false );
	} );
	await collaborationUtils.waitForCollaborationReady( duplicatePage );
	return duplicatePage;
}

async function openCollaboratorsPopover( page: Page ) {
	const presenceButton = page.getByRole( 'button', {
		name: /Collaborators list/,
	} );
	await expect( presenceButton ).toBeVisible( { timeout: 10000 } );
	await presenceButton.click();
	return presenceButton;
}

test.describe( 'Collaboration - Presence', () => {
	test( 'Collaborator avatars appear when two users are editing', async ( {
		collaborationUtils,
		requestUtils,
		page,
	} ) => {
		const post = await requestUtils.createPost( {
			title: 'Presence Test - Avatars',
			status: 'draft',
			date_gmt: new Date().toISOString(),
		} );
		await collaborationUtils.openCollaborativeSession( post.id );

		// The collaborator presence button renders when other
		// collaborators are present.
		await expect(
			page.getByRole( 'button', { name: /Collaborators list/ } )
		).toBeVisible( { timeout: 10000 } );
	} );

	test( 'Collaborator name shows in the popover list', async ( {
		collaborationUtils,
		requestUtils,
		page,
	} ) => {
		const post = await requestUtils.createPost( {
			title: 'Presence Test - Name',
			status: 'draft',
			date_gmt: new Date().toISOString(),
		} );
		await collaborationUtils.openCollaborativeSession( post.id );

		// Wait for the presence button to appear and click to open popover.
		const presenceButton = page.getByRole( 'button', {
			name: /Collaborators list/,
		} );
		await expect( presenceButton ).toBeVisible( { timeout: 10000 } );
		await presenceButton.click();

		// The popover should list the second collaborator by name.
		await expect(
			page.locator( '.editor-collaborators-presence__list-item-name', {
				hasText: 'Test Collaborator',
			} )
		).toBeVisible();
	} );

	test( 'Collaborator list dedupes duplicate tabs and windows for the same collaborator', async ( {
		collaborationUtils,
		requestUtils,
		page,
	} ) => {
		const post = await requestUtils.createPost( {
			title: 'Presence Test - Duplicate Collaborator Tabs',
			status: 'draft',
			date_gmt: new Date().toISOString(),
		} );

		await collaborationUtils.openCollaborativeSession( post.id );

		const collaboratorPage = collaborationUtils.page2;
		const duplicateCollaboratorPage = await openDuplicateEditorPage( {
			collaborationUtils,
			page: collaboratorPage,
			postId: post.id,
		} );
		const { page: duplicateCollaboratorWindowPage } =
			await collaborationUtils.joinUser( post.id, SECOND_USER );

		await collaborationUtils.waitForSyncCycle( page, 3, {
			timeout: 30000,
		} );
		await collaborationUtils.waitForSyncCycle(
			duplicateCollaboratorPage,
			3,
			{
				timeout: 30000,
			}
		);
		await collaborationUtils.waitForSyncCycle(
			duplicateCollaboratorWindowPage,
			3,
			{
				timeout: 30000,
			}
		);

		const presenceButton = await openCollaboratorsPopover( page );
		await expect( presenceButton ).toHaveAccessibleName(
			/Collaborators list, 2 online/
		);
		await expect(
			page.locator( '.editor-collaborators-presence__list-item' )
		).toHaveCount( 2 );
		await expect(
			page.locator( '.editor-collaborators-presence__list-item-name', {
				hasText: 'You',
			} )
		).toBeVisible();
		await expect(
			page.locator( '.editor-collaborators-presence__list-item-name', {
				hasText: 'Test Collaborator',
			} )
		).toHaveCount( 1 );

		await duplicateCollaboratorWindowPage.close();

		await collaborationUtils.waitForSyncCycle( page, 3, {
			timeout: 30000,
		} );

		await expect( presenceButton ).toHaveAccessibleName(
			/Collaborators list, 2 online/
		);
		await expect(
			page.locator( '.editor-collaborators-presence__list-item' )
		).toHaveCount( 2 );
		await expect(
			page.locator( '.editor-collaborators-presence__list-item-name', {
				hasText: 'Test Collaborator',
			} )
		).toHaveCount( 1 );
	} );

	test( 'Presence button stays hidden when only the current user has duplicate tabs open', async ( {
		collaborationUtils,
		requestUtils,
		page,
	} ) => {
		const post = await requestUtils.createPost( {
			title: 'Presence Test - Duplicate Current User Tabs',
			status: 'draft',
			date_gmt: new Date().toISOString(),
		} );

		await collaborationUtils.openPost( post.id );

		const duplicatePage = await openDuplicateEditorPage( {
			collaborationUtils,
			page,
			postId: post.id,
		} );

		await collaborationUtils.waitForSyncCycle( page, 3, {
			timeout: 30000,
		} );
		await collaborationUtils.waitForSyncCycle( duplicatePage, 3, {
			timeout: 30000,
		} );

		await expect(
			page.getByRole( 'button', { name: /Collaborators list/ } )
		).toBeHidden();

		await duplicatePage.close();
	} );
} );
